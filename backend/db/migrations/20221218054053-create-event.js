'use strict';

let options = {};
if (process.env.NODE_ENV === 'production') {
  options.schema = process.env.SCHEMA;
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Events', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      venueId: {
        type: Sequelize.INTEGER,
        allowNull:false,
        references:{
          model:'Venues',
          key:'id'
        }
      },
      groupId: {
        type: Sequelize.INTEGER,
        allowNull:false,
        references:{
          model:'Groups',
          key:'id'
        }
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull:false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull:false
      },
      type: {
        type: Sequelize.ENUM,
        allowNull:false
      },
      capacity: {
        type: Sequelize.INTEGER
      },
      price: {
        type: Sequelize.INTEGER
      },
      startDate: {
        type: Sequelize.DATE
      },
      endDate: {
        type: Sequelize.DATE
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRRENT_TIMESTAMP')
      }
    });
  },
  async down(queryInterface, Sequelize) {
    options.tableName='Events'
    await queryInterface.dropTable(options);
  }
};