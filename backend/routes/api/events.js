// backend/routes/api/events.js
const express = require('express');
const router = express.Router();

const { requireAuth, requireUserAuth, requireEventAuth } = require('../../utils/auth');
const { Event, Group, Attendance, EventImage, Venue, Membership, User } = require('../../db/models');

const { check } = require('express-validator');
const { handleValidationErrors, checkForInvalidEvent, validateEventInput } = require('../../utils/validation');
const { Op } = require('sequelize');
const { validationResult } = require('express-validator');

// GET /api/events
// Return all events

const validateEventQueryParamInput=[
    (req,res,next)=>{
        let page = +req.query.page
        if(isNaN(page)) page = 1;
        if(page <1){
            const err = new Error(`Page must be greater than or equal to 1`);
            err.title = 'Invalid Page Parameter';
            err.errors = [`Page must be greater than or equal to 1`];
            err.status = 400;
            req.errors=err;
            return next(err)
        }
        res.locals.page=page;
        next();
    },
    (req,res,next)=>{
        let size = +req.query.size;
        if(isNaN(size)) size=20;
        if(size <1 || size>20){
            const err = new Error(`Size must be greater than or equal to 1 and less than or equal to 20`);
            err.title = 'Invalid Size Parameter';
            err.errors = [`Size must be greater than or equal to 1 and less than or equal to 20`];
            err.status = 400;
            return next(err)
        }
        res.locals.size=size;
        next();
    },
    (req,res,next)=>{
        if(req.query.name){
            // if(typeof name !== 'string'){
            //     const err = new Error(`Name must be a string`);
            //     err.title = 'Invalid name';
            //     err.errors = [`Name must be a string`];
            //     err.status = 400;
            //     return next(err)
            // }
            res.locals.name=req.query.name;
            console.log(res.locals.name)
        }

        next();
    },
    (req,res,next)=>{
        if(req.query.type){
            if(type !== 'Online' || type !=='In person'){
                const err = new Error(`Type must be 'Online' or 'In Person`);
                err.title = 'Invalid type';
                err.errors = [`Type must be 'Online' or 'In Person`];
                err.status = 400;
                return next(err)
            }
            res.locals.type=req.query.type;
        }

        next();
    },
    (req,res,next)=>{
        if(req.query.startDate){
            if(typeof name !== 'string'){
                const err = new Error(`Start date must be a valid datetime`);
                err.title = 'Invalid startDate';
                err.errors = [`Start date must be a valid datetime`];
                err.status = 400;
                return next(err)
            }
            res.locals.startDate=req.query.startDate;
        }

        next();
    },

  ];

router.get('/',validateEventQueryParamInput, async (req,res,next)=>{

    const query =  {
        attributes:{
        exclude:['createdAt','updatedAt','description','capacity','price']
            },
            include:[
                {
                    model:Group,
                    attributes:['id','name','city','state']
                },
                {
                    model:Venue,
                    attributes:['id','city','state']
                }
            ],
            limit: res.locals.size,
            offset: res.locals.size*(res.locals.page-1)
    }

    console.log('made it to my quyery')
    if(res.locals.name) query.where.name=res.locals.name;
    if(res.locals.type) query.where.type=res.locals.type;
    if(res.locals.startDate) query.where.startDate=res.locals.startDate;


    const allEvents = await Event.findAll(query);


    const returnArray= [];
    // Lazy load preview image for event
    for(let i=0; i<allEvents.length;i++){
        const event = allEvents[i].toJSON();
        //Lazy load each aggregate for numAttending
        const attendees = await Attendance.count({
            where:{
                eventId:event.id
            }
        })
        event.numAttending=attendees;

        // Lazy load each Image
        const eventImage = await EventImage.findOne({
            where:{
                eventId:event.id
            },
            raw:true
        })
        if(eventImage) event.previewImage=eventImage.url;
        else event.previewImage=null;

        returnArray.push(event);
        // console.log('checking my event', event)
    }


    res.json(returnArray);

})

// GET /api/events/:eventId/attendees
// Get all attendees of an event specified by its id
// Improvements - rafactor validations.
router.get('/:eventId/attendees', async (req,res,next)=>{

    const targetEvent = await Event.findByPk(req.params.eventId);

    if(!targetEvent){
        const err = new Error(`Event couldn't be found`);
        err.title = 'Invalid Event';
        err.errors = [`Event couldn't be found`];
        err.status = 404;
        return next(err)
    }

    const targetEventJSON = targetEvent.toJSON();

    // Check if user is host or co-host
    const currentUser = await Membership.findOne({
        where:{
            userId:req.user.id,
            groupId:targetEventJSON.groupId
        }
    })

    let currentUserJSON;
    if(currentUser) currentUserJSON = currentUser.toJSON();

    // Build query object
    const query={
        attributes: ['id','firstName','lastName'],
        include:{
            model:Attendance,
            attributes:['status'],
            required:true,
            include:{
                model:Event,
                where:{
                    id:targetEventJSON.id
                },
                attributes:[]
            }
        }
    };


    // If user is not host or co-host, OR, currentUser is not a member of the group
    if(!currentUser || (!currentUserJSON.status ==='host' && !currentUserJSON.status === 'co-host')){
        query.include.where={
            status:{
                [Op.notIn]:['pending']
            }
        }
    }

    const attendeeList = await User.findAll(query);
    const returnObj = {Attendees:[]};

    // Object manipulation to get Attendance to show up as an object instead of an array of objects
    for(let i=0;i<attendeeList.length;i++){
        const attendee = attendeeList[i].toJSON();
        console.log('checking this ~~~~~ 1 ', attendee)
        attendee.Attendance = attendee.Attendances[0];
        delete attendee.Attendances;
        returnObj.Attendees.push(attendee);
    }


    res.json(returnObj)

})

// POST /api/events/:eventId/attendance
// Request attendance for an event specified by id
// Improvements - validations consolidate
router.post('/:eventId/attendance', requireAuth, async (req,res,next)=>{


    const targetEvent = await Event.findByPk(req.params.eventId);

    if(!targetEvent){
        const err = new Error(`Event couldn't be found`);
        err.title = 'Invalid Event';
        err.errors = [`Event couldn't be found`];
        err.status = 404;
        return next(err)
    }

    const userId = req.user.id;

    // Validate user is a member of the group, and is not a 'pending' member
    // User must be member of the group
    const currentUser = await Membership.findOne({
        where:{
            userId:userId,
            groupId:targetEvent.groupId,
            status:{
                [Op.notIn]:['pending']
            }
        }
    })

    if(!currentUser){
        const err = new Error(`Must be a member of the group to request attendance`);
        err.title = 'Invalid request';
        err.errors = [`Must be a member of the group to request attendance`];
        err.status = 403;
        return next(err)
    }

    // Check if attendance has already been requested
    const attendanceToEvent = await Attendance.findAll({
        where:{
            eventId:targetEvent.id,
            userId:userId
        }
    })

    console.log('attendance to event', attendanceToEvent)
    if(attendanceToEvent.length>0) {
        const err = new Error(`Attendance has already been requested`);
        err.title = 'Invalid request';
        err.errors = [`Attendance has already been requested`];
        err.status = 400;
        return next(err)
    }

    await Attendance.create({
        eventId:targetEvent.id,
        userId:userId,
        status:'pending'
    })

    res.json({
        userId,
        status:'pending'
    })
})

// PUT /api/events/:eventId/attendance
// Change the status of an attendance for an event specified by id
// Improvements
    // Make sure that inputs for status either, attending, or member
    // Only delete a valid user from userId input
    // Move up my authentication for users - right now it's at the end
router.put('/:eventId/attendance', requireAuth, requireUserAuth, async (req,res,next)=>{

    const { userId, status } = req.body;

    if(status === 'pending') {
        const err = new Error(`Cannot change an attendance status to pending`);
        err.title = 'Invalid Change to Attendance';
        err.errors = [`Cannot change an attendance status to pending`];
        err.status = 400;
        return next(err)
    }

    const targetAttendance = await Attendance.findAll({
        where:{
            userId:userId,
            eventId:req.params.eventId
        },
    })

    console.log('Checking attendance length ~~~~~~~~~~~~`', targetAttendance)

    // If attendance does not exist
    if(targetAttendance < 1){
        const err = new Error(`Attendance between the user and the event does not exist`);
        err.title = 'Invalid Attendance Log';
        err.errors = [`Attendance between the user and the event does not exist`];
        err.status = 400;
        return next(err)
    }

    const attendanceLog = targetAttendance[0]
    // check to make sure that member is a co-host
    if(status === 'member'){
        const member = await Membership.findOne({
            where:{
                groupId:res.locals.groupId,
                userId:userId
            }
        })
        console.log('member ~~~~~~~~`', member.status, !member, !(member.status =='co-host' || member.status=='host'))
        if( !member || !(member.status ==='co-host' || member.status==='host')){
            const err = new Error(`Cannot change status to 'member' if user is not host or co-host`);
            err.title = 'Invalid User Status';
            err.errors = [`Cannot change status to 'member' if user is not host or co-host`];
            err.status = 403;
            return next(err)
        }
        attendanceLog.status=status;
    }
    if(status==='attending') attendanceLog.status=status;

    await attendanceLog.save();

    const checkAttendance = await Attendance.findByPk(attendanceLog.id,{
        attributes: {
            exclude:['createdAt','updatedAt']
        }
    })

    res.json(checkAttendance)

})

// DELETE /api/events/:eventId/attendance
// Delete an attendance to an event specified by id
// Improvements - consolidate validations
router.delete('/:eventId/attendance', requireAuth, async (req,res,next)=>{

    const { userId } = req.body;

    const targetEvent = await Event.findByPk(req.params.eventId);

    if(!targetEvent){
        const err = new Error(`Event couldn't be found`);
        err.title = 'Invalid Event';
        err.errors = [`Event couldn't be found`];
        err.status = 404;
        return next(err)
    }

    // Check to make sure user is
    const user = await User.findByPk(req.user.id);
    const membershipCheck = await Membership.findOne({
        where:{
            groupId:targetEvent.groupId,
            userId:req.user.id
        }
    })

    const attendance = await Attendance.findOne({
        where:{
            userId:userId,
            eventId:req.params.eventId,
        }
    })

    if(!attendance){
        const err = new Error(`Attendance does not exist for this User`);
        err.title = 'Invalid Attendance';
        err.errors = [`Attendance does not exist for this User`];
        err.status = 404;
        return next(err)
    }

    if((userId === req.user.id) || (membershipCheck.status === 'co-host') || (membershipCheck.status === 'host')){
        await attendance.destroy();

        res.json({
            message:'Successfully deleted attendance from event'
        })
    } else {
        const err = new Error(`Only the User or organizer may delete an Attendance`);
        err.title = 'Invalid Permissions';
        err.errors = [`Only the User or organizer may delete an Attendance`];
        err.status = 403;
        return next(err)
    }

})

// POST /api/events/:eventId/images
// Create and return a new image for an event specified by id
router.post('/:eventId/images', checkForInvalidEvent, requireAuth, requireEventAuth, async (req,res,next)=>{

    const { url, preview } = req.body;

    const image = await EventImage.create({
        eventId:req.params.eventId,
        url,
        preview
    })

    const checkImage = await EventImage.findByPk(image.id,{
        attributes:{
            exclude:['createdAt','updatedAt','eventId']
        }
    });

    res.json(checkImage)

});

// GET /api/events/:eventId
// Returns the details of an event specified by its id
router.get('/:eventId', checkForInvalidEvent, async (req,res,next)=>{

    const event = res.locals.event;

    // Lazy load numAttending
    const attendees = await Attendance.count({
        where:{
            eventId:event.id
        }
    })

    // Lazy load group
    const group = await event.getGroup({
        attributes: ['id','name','private','city','state']
    });

    // Lazy load Venue
    const venue = await event.getVenue({
        attributes:{
            exclude:['createdAt','updatedAt','groupId']
        }
    });

    // Lazy load associated EventImages
    const eventImages = await event.getEventImages({
        attributes: ['id','url','preview']
    });

    const returnEvent = event.toJSON();

    // Add all found attributes to returned Event object
    returnEvent.numAttending = attendees;
    returnEvent.Group = group;
    returnEvent.Venue = venue;
    returnEvent.EventImages = eventImages;

    res.json(returnEvent);

})

// PUT /api/events/:eventId
// Edit and returns an event specified by its id
    // Improvements - optimize and make validate venue less sketchy - validations in general need improvement here
router.put('/:eventId',checkForInvalidEvent, requireAuth, requireUserAuth, validateEventInput,  async (req,res,next)=>{
    // Paused until routes for Venues are added
    const { venueId, name, type, capacity, price, description, startDate, endDate } = req.body;

    const foundEvent = await Event.findByPk(req.params.eventId);

    foundEvent.venueId = venueId;
    foundEvent.name = name;
    foundEvent.type = type;
    foundEvent.capacity = capacity;
    foundEvent.price = price;
    foundEvent.description = description;
    foundEvent.startDate = startDate;
    foundEvent.endDate = endDate;

    await foundEvent.save();

    const returnedEvent = await Event.findByPk(foundEvent.id,{
        attributes:{
            exclude:['createdAt','updatedAt']
        }
    })

    res.json(returnedEvent)
});

// DELETE /api/events/:eventId
router.delete('/:eventId', checkForInvalidEvent, requireAuth, requireUserAuth, async (req,res,next)=>{

    const event = await Event.findByPk(req.params.eventId);

    // console.log('CHECKING EVENT ~~~~~~~~', event)

    await event.destroy();

    res.json({
        message:'Successfully deleted'
    })
});


module.exports = router;
