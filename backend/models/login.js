const mongoose = require("mongoose");

const pharmacyUserSchema = mongoose.Schema({
    phone:{
        type:String,
        required:true,
    },
    email:{
        type:String,
        required:true,
    },
    location:{
        type:String,
        required:true,
    },
    PanOrVat:{
        type:String,
    },
    pharmacyName: {
        type: String,
        required: true,
    },
    id: {
        type: String,
        required: true, 
    },
    password: {
        type: String,
        required: true, 
    },
    isActive:{
        type:Boolean,
        default:true
    },
    isAdmin:{
        type:Boolean,
        default:false,
    }
    
},
{
    timestamps: true, 
});

const PharmacyUser = mongoose.model("PharmacyUser", pharmacyUserSchema);
module.exports = PharmacyUser;