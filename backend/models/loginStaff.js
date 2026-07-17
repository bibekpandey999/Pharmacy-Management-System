const mongoose = require("mongoose");

const pharmacyStaffSchema = mongoose.Schema({
  
    staffName:{
    type:String,
  },
   pharmacyName: {
        type: String,
    },
    id: {
        type: String,
        required: true, 
    },
    password: {
        type: String,
        required: true, 
    },
      role: {
        type: String,
        default: 'staff'
    },
    isActive:{
        type:Boolean,
        default:true
    },
   
    
},
{
    timestamps: true, 
});

const PharmacyStaff = mongoose.model("PharmacyStaff", pharmacyStaffSchema);
module.exports = PharmacyStaff;