'use strict';
const {
  Model, Validate
} = require('sequelize');

const { Venue } = require('./index');

module.exports = (sequelize, DataTypes) => {
  class Event extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
      Event.hasMany(models.EventImage,{foreignKey:'eventId'});
      Event.hasMany(models.Attendance,{foreignKey:'eventId'});

      Event.belongsTo(models.Venue,{foreignKey:'venueId'});
      Event.belongsTo(models.Group,{foreignKey:'groupId'});
    }
  }
  Event.init({
    venueId: {
      type:DataTypes.INTEGER,
      allowNull:false,
      validate:{
        // Validate that the venue exists
        async venueExists(value){
          const venue = await Venue.findByPk(value);

          //If not found, throw an error
          if(!venue) {
            throw new Error('Venue does not exist')
          }
        }
      }
    },
    groupId: {
      type:DataTypes.INTEGER,
      allowNull:false
    },
    name: {
      type:DataTypes.STRING,
      allowNull:false,
      validate:{
        //Input string must be at least 5 characters
        nameLengthValidate(value){
          if(value.length<5){
            throw new Error('Name must be at least 5 characters')
          }
        }
      }
    },
    description: {
      type:DataTypes.TEXT,
      allowNull:false
    },
    type: {
      type:DataTypes.ENUM('Online','In person'),
      allowNull:false,
      validate:{
        //Validate that the type of event must be 'Online' or 'In person'
        isIn:['Online','In person'] // do we need to do this if it is enum above?
      }
    },
    capacity: {
      type:DataTypes.INTEGER,
    },
    price:{
      type:DataTypes.INTEGER,
      allowNull:false
    },
    startDate: {
      type:DataTypes.DATE,
      allowNull:false,
      validate:{
        //Validate that the start date is in the future
        dateInFuture(value){
          const currentDate= new Date();
          const checkDate = new Date(value);
          if(currentDate>checkDate){
            throw new Error('Start date must be in the future')
          }
        }
      }
    },
    endDate: {
      type:DataTypes.DATE,
      allowNull:false,
      validate: {
        //Validate that the end date is not less than the start date
        isAfter:this.startDate
      }
    }
  }, {
    sequelize,
    modelName: 'Event',
  });
  return Event;
};