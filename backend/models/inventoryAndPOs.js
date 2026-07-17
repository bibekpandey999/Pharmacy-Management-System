const mongoose = require("mongoose");

const medicineInventorySchema = mongoose.Schema({
    medicineBrandName: {
        type: String,
        required: true, 
    },
    genericMoleculeName: {
        type: String,
        required: true, 
    },
    categoryType: {
        type: String,
    },
    dosageStrength: {
        type: String, 
    },
    purchaseUnitCost: {
        type: Number, 
    },
    retailPrice: {       
        type: Number, 
    },
    initialStockQty: {
        type: Number, 
        default: 0,
    },
    reorderThresholdAlert: {
        type: Number,
        default: 10,
    },
    skuBarcodeReference: {
        type: String,
        unique: true, 
        sparse: true, 
    },
    expirationDate: {
        type: Date,   
    },
    supplierDistributor: {
        type: String, 
    },
     pharmacyId: {
        type: String,
    },
   
},
{
    timestamps: true, 
});

const Inventory = mongoose.model("InventoryAndPO", medicineInventorySchema);
module.exports = Inventory;