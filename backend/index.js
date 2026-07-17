const express = require("express");
const cors = require("cors");
const conectDb = require("./connectDb");
const userModule = require("./models/user");
const Inventory = require("./models/inventoryAndPOs");
const Bill = require("./models/bill");
const PharmacyUser = require("./models/login");
const PharmacyStaff = require("./models/loginstaff"); 
const EMR = require("./models/emr");

const app = express();
const PORT = 5000;


// Added http://localhost:3000 here to match your frontend dev server port!
const allowedOrigins = [
    process.env.FRONTEND_URL,
    "https://ict-club-f0s3w2shh-gautamaswin20-4328s-projects.vercel.app",
    "http://localhost:3000",   // <-- Dev Server Port
    "http://localhost:5173",
    "http://127.0.0.1:5173"
].filter(Boolean);

const corsOptions = {
    origin: function (origin, callback) {
        // Postman, mobile apps, or same-origin requests sometimes have an undefined origin
       if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`CORS policy blocked: ${origin}`));
        }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
};

// Middleware
app.use(cors(corsOptions)); 
app.use(express.json());

// Global Helper functions
const getValue = (val, fallback) => (val !== undefined && val !== null && String(val).trim() !== "") ? val : fallback;

// Safe Number parsing helper to prevent NaN database crashes
const parseNum = (val, fallback = 0) => {
    const parsed = Number(val);
    return isNaN(parsed) ? fallback : parsed;
};

// Helper to reliably normalize both Array and String inputs into a Database string string formatting
const parseArrayOrString = (arrayVal, stringVal, fallback = "None") => {
    if (Array.isArray(arrayVal)) return arrayVal.length > 0 ? arrayVal.join(', ') : fallback;
    return getValue(stringVal, fallback);
};

// ==========================================
// 🏥 PATIENTS ROUTES
// ==========================================

// POST Route to Save Patient Details
app.post("/api/patients", async (req, res) => {
    try {
        const formData = req.body;
      

        const newPatient = await userModule.create({
            name: getValue(formData.name || formData.fullName, "Unknown Patient"),
            gender: getValue(formData.gender, "Not Specified"),
            age: getValue(formData.age, ""),
            dob: getValue(formData.dob, "YYYY-MM-DD"),
            phoneNumber: getValue(formData.phoneNumber || formData.phone, "0000000000"),
            address: getValue(formData.address, ""),
            nationalIdentityNumber: getValue(formData.nationalIdentityNumber || formData.nationalId, ""),
            bloodGroup: getValue(formData.bloodGroup || formData.bloodType, ""),
            language: getValue(formData.language || formData.preferredLanguage, ""),
            drugSensitivities: parseArrayOrString(formData.allergies, formData.drugSensitivities, "None"),
            chronicConditions: parseArrayOrString(formData.chronicConditions, formData.chronicConditions, "None"),
            emergencyContactPerson: getValue(formData.emergencyContactPerson || formData.emergencyContactName, ""),
            emergencyContactPhone: getValue(formData.emergencyContactPhone, ""),
            pharmacyId: getValue(formData.pharmacyId, ""),
            weight: getValue(formData.weight, "")
        });

        return res.status(201).json({ 
            success: true, 
            message: "Patient record saved successfully!", 
            data: newPatient 
        });

    } catch (error) {
        console.error("🔴 DATABASE WRITE CRASH:", error);
        return res.status(500).json({ 
            success: false, 
            message: "Failed to write patient data to MongoDB.",
            error: error.message 
        });
    }
});

// GET Route to fetch all patients
app.get("/api/patients", async (req, res) => {
    try {
        const dbPatients = await userModule.find({});

        const patients = dbPatients.map(patient => {
            const allergiesArray = (patient.drugSensitivities && patient.drugSensitivities !== 'None') 
                ? patient.drugSensitivities.split(', ') 
                : [];
            
            const chronicArray = (patient.chronicConditions && patient.chronicConditions !== 'None') 
                ? (typeof patient.chronicConditions === 'string' ? patient.chronicConditions.split(', ') : patient.chronicConditions)
                : [];

            return {
                id: patient._id,
                _id: patient._id,
                name: patient.name,
                fullName: patient.name, 
                phone: patient.phoneNumber,
                phoneNumber: patient.phoneNumber,
                gender: patient.gender,
                age: patient.age,
                dob: patient.dob,
                address: patient.address,
                nationalId: patient.nationalIdentityNumber,
                nationalIdentityNumber: patient.nationalIdentityNumber,
                bloodType: patient.bloodGroup,
                bloodGroup: patient.bloodGroup,
                preferredLanguage: patient.language,
                language: patient.language,
                drugSensitivities: patient.drugSensitivities,
                allergies: allergiesArray, 
                chronicConditions: chronicArray, 
                emergencyContactName: patient.emergencyContactPerson,
                emergencyContactPerson: patient.emergencyContactPerson,
                emergencyContactPhone: patient.emergencyContactPhone,
                pharmacyId: patient.pharmacyId,
                weight: patient.weight,
                createdAt: patient.createdAt || new Date().toISOString()
            };
        });

        return res.status(200).json({
            success: true,
            count: patients.length,
            data: patients 
        });
    } catch (error) {
        console.error("🔴 Backend fetch failed:", error);
        return res.status(500).json({ success: false, message: "Error fetching clinic records." });
    }
});

// PUT Route to Update Patient Details by ID
app.put("/api/patients/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const formData = req.body;
        console.log(`=== UPDATING PATIENT ID: ${id} ===`);

        const updatedFields = {
            name: getValue(formData.name || formData.fullName, "Unknown Patient"),
            gender: getValue(formData.gender, "Not Specified"),
            age: getValue(formData.age, ""),
            dob: getValue(formData.dob, "YYYY-MM-DD"),
            phoneNumber: getValue(formData.phoneNumber || formData.phone, "0000000000"),
            address: getValue(formData.address, ""),
            nationalIdentityNumber: getValue(formData.nationalIdentityNumber || formData.nationalId, ""),
            bloodGroup: getValue(formData.bloodGroup || formData.bloodType, ""),
            language: getValue(formData.language || formData.preferredLanguage, ""),
            drugSensitivities: parseArrayOrString(formData.allergies, formData.drugSensitivities, "None"),
            chronicConditions: parseArrayOrString(formData.chronicConditions, formData.chronicConditions, "None"),
            emergencyContactPerson: getValue(formData.emergencyContactPerson || formData.emergencyContactName, ""),
            emergencyContactPhone: getValue(formData.emergencyContactPhone, ""),
            pharmacyId: getValue(formData.pharmacyId, ""),
            weight: getValue(formData.weight, "")
        };

        const updatedPatient = await userModule.findByIdAndUpdate(
            id,
            { $set: updatedFields },
            { new: true, runValidators: true }
        );

        if (!updatedPatient) {
            return res.status(404).json({ success: false, message: "Patient record not found." });
        }

        return res.status(200).json({
            success: true,
            message: "Patient record updated successfully!",
            data: updatedPatient
        });

    } catch (error) {
        console.error("🔴 Backend update failed:", error);
        return res.status(500).json({ 
            success: false, 
            message: "Error updating patient record.",
            error: error.message 
        });
    }
});

// DELETE Route to Remove a Patient Record by ID
app.delete("/api/patients/:id", async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`=== DELETING PATIENT ID: ${id} ===`);

        const deletedPatient = await userModule.findByIdAndDelete(id);

        if (!deletedPatient) {
            return res.status(404).json({ success: false, message: "Patient record not found." });
        }

        return res.status(200).json({
            success: true,
            message: "Patient record deleted successfully!",
            deletedPatientId: id
        });
    } catch (error) {
        console.error("🔴 Backend deletion failed:", error);
        return res.status(500).json({ success: false, message: "Error deleting patient record." });
    }
});




// ==========================================
// 💊 EMR
// ==========================================

app.post("/api/emr", async (req, res) => {
    try {
        const formData = req.body;

        if (!formData.patientId || !formData.pharmacyId || !formData.visitDate || !formData.chiefComplaint) {
            return res.status(400).json({
                success: false,
                message: "patientId, pharmacyId, visitDate and chiefComplaint are required."
            });
        }

        const newRecord = await EMR.create({
            patientId: getValue(formData.patientId, ""),
            pharmacyId: getValue(formData.pharmacyId, ""),
            visitDate: getValue(formData.visitDate, ""),
            chiefComplaint: getValue(formData.chiefComplaint, ""),
            diagnosis: getValue(formData.diagnosis, ""),
            symptoms: Array.isArray(formData.symptoms) ? formData.symptoms : [],
            vitals: {
                bp: getValue(formData.vitals?.bp, ""),
                temp: getValue(formData.vitals?.temp, ""),
                pulse: getValue(formData.vitals?.pulse, ""),
                weight: getValue(formData.vitals?.weight, ""),
                spo2: getValue(formData.vitals?.spo2, ""),
            },
            prescription: getValue(formData.prescription, ""),
            labTests: Array.isArray(formData.labTests) ? formData.labTests : [],
            notes: getValue(formData.notes, ""),
            followUpDate: getValue(formData.followUpDate, ""),
            doctorName: getValue(formData.doctorName, ""),
        });

        return res.status(201).json({
            success: true,
            message: "EMR record saved successfully!",
            data: newRecord
        });

    } catch (error) {
        console.error("🔴 DATABASE WRITE CRASH:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to write EMR data to MongoDB.",
            error: error.message
        });
    }
});

app.get("/api/emr", async (req, res) => {
    try {
        const dbRecords = await EMR.find({}).sort({ visitDate: -1 });

        const records = dbRecords.map(record => ({
            id: record._id,
            _id: record._id,
            patientId: record.patientId,
            pharmacyId: record.pharmacyId,
            visitDate: record.visitDate,
            chiefComplaint: record.chiefComplaint,
            diagnosis: record.diagnosis,
            symptoms: record.symptoms || [],
            vitals: record.vitals || {},
            prescription: record.prescription,
            labTests: record.labTests || [],
            notes: record.notes,
            followUpDate: record.followUpDate,
            doctorName: record.doctorName,
            createdAt: record.createdAt || new Date().toISOString()
        }));

        return res.status(200).json({
            success: true,
            count: records.length,
            data: records
        });
    } catch (error) {
        console.error("🔴 Backend fetch failed:", error);
        return res.status(500).json({ success: false, message: "Error fetching EMR records." });
    }
});

app.get("/api/emr/patient/:patientId", async (req, res) => {
    try {
        const { patientId } = req.params;
        const dbRecords = await EMR.find({ patientId }).sort({ visitDate: -1 });

        const records = dbRecords.map(record => ({
            id: record._id,
            _id: record._id,
            patientId: record.patientId,
            pharmacyId: record.pharmacyId,
            visitDate: record.visitDate,
            chiefComplaint: record.chiefComplaint,
            diagnosis: record.diagnosis,
            symptoms: record.symptoms || [],
            vitals: record.vitals || {},
            prescription: record.prescription,
            labTests: record.labTests || [],
            notes: record.notes,
            followUpDate: record.followUpDate,
            doctorName: record.doctorName,
            createdAt: record.createdAt || new Date().toISOString()
        }));

        return res.status(200).json({
            success: true,
            count: records.length,
            data: records
        });
    } catch (error) {
        console.error("🔴 Backend fetch failed:", error);
        return res.status(500).json({ success: false, message: "Error fetching patient EMR records." });
    }
});

app.get("/api/emr/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const record = await EMR.findById(id);

        if (!record) {
            return res.status(404).json({ success: false, message: "EMR record not found." });
        }

        return res.status(200).json({
            success: true,
            data: {
                id: record._id,
                _id: record._id,
                patientId: record.patientId,
                pharmacyId: record.pharmacyId,
                visitDate: record.visitDate,
                chiefComplaint: record.chiefComplaint,
                diagnosis: record.diagnosis,
                symptoms: record.symptoms || [],
                vitals: record.vitals || {},
                prescription: record.prescription,
                labTests: record.labTests || [],
                notes: record.notes,
                followUpDate: record.followUpDate,
                doctorName: record.doctorName,
                createdAt: record.createdAt || new Date().toISOString()
            }
        });
    } catch (error) {
        console.error("🔴 Backend fetch failed:", error);
        return res.status(500).json({ success: false, message: "Error fetching EMR record." });
    }
});

app.put("/api/emr/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const formData = req.body;

        const updatedFields = {
            visitDate: getValue(formData.visitDate, ""),
            chiefComplaint: getValue(formData.chiefComplaint, ""),
            diagnosis: getValue(formData.diagnosis, ""),
            symptoms: Array.isArray(formData.symptoms) ? formData.symptoms : [],
            vitals: {
                bp: getValue(formData.vitals?.bp, ""),
                temp: getValue(formData.vitals?.temp, ""),
                pulse: getValue(formData.vitals?.pulse, ""),
                weight: getValue(formData.vitals?.weight, ""),
                spo2: getValue(formData.vitals?.spo2, ""),
            },
            prescription: getValue(formData.prescription, ""),
            labTests: Array.isArray(formData.labTests) ? formData.labTests : [],
            notes: getValue(formData.notes, ""),
            followUpDate: getValue(formData.followUpDate, ""),
            doctorName: getValue(formData.doctorName, ""),
        };

        const updatedRecord = await EMR.findByIdAndUpdate(
            id,
            { $set: updatedFields },
            { new: true, runValidators: true }
        );

        if (!updatedRecord) {
            return res.status(404).json({ success: false, message: "EMR record not found." });
        }

        return res.status(200).json({
            success: true,
            message: "EMR record updated successfully!",
            data: updatedRecord
        });

    } catch (error) {
        console.error("🔴 Backend update failed:", error);
        return res.status(500).json({
            success: false,
            message: "Error updating EMR record.",
            error: error.message
        });
    }
});

app.delete("/api/emr/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const deletedRecord = await EMR.findByIdAndDelete(id);

        if (!deletedRecord) {
            return res.status(404).json({ success: false, message: "EMR record not found." });
        }

        return res.status(200).json({
            success: true,
            message: "EMR record deleted successfully!",
            deletedRecordId: id
        });
    } catch (error) {
        console.error("🔴 Backend deletion failed:", error);
        return res.status(500).json({ success: false, message: "Error deleting EMR record." });
    }
});



// ==========================================
// 💊 INVENTORY ROUTES
// ==========================================

// POST: Add Medicine to Inventory safely with Clean Duplicate Error Catching
app.post("/api/inventory", async (req, res) => {
    try {
        const formData = req.body;
        console.log("=== INCOMING MEDICINE DATA ===");
        console.log(formData);

        const newMedicine = await Inventory.create({
            medicineBrandName: getValue(formData.medicineBrandName, "Unknown Brand"),
            genericMoleculeName: getValue(formData.genericMoleculeName, "Unknown Molecule"),
            categoryType: getValue(formData.categoryType, "Uncategorized"),
            dosageStrength: getValue(formData.dosageStrength, "N/A"),
            purchaseUnitCost: parseNum(getValue(formData.purchaseUnitCost, 0)),
            retailPrice: parseNum(getValue(formData.retailPrice || formData.retailRetailPrice, 0)),
            initialStockQty: parseNum(getValue(formData.initialStockQty, 0)),
            reorderThresholdAlert: parseNum(getValue(formData.reorderThresholdAlert, 10)),
            skuBarcodeReference: getValue(formData.skuBarcodeReference, ""),
            expirationDate: getValue(formData.expirationDate, null),
            supplierDistributor: getValue(formData.supplierDistributor, "Unknown Supplier"),
            pharmacyId: getValue(formData.pharmacyId, "")
        });

        return res.status(201).json({ 
            success: true, 
            message: "Medicine item added to inventory successfully!", 
            data: newMedicine 
        });

    } catch (error) {
        console.error("🔴 DATABASE WRITE CRASH:", error);
        
        // Handle MongoDB Duplicate Key Error cleanly (e.g., repeating a unique SKU/barcode string)
        if (error.code === 11000) {
            const duplicateField = Object.keys(error.keyValue)[0];
            return res.status(400).json({
                success: false,
                message: `An inventory item with this ${duplicateField} ("${error.keyValue[duplicateField]}") already exists! Please use a unique value.`
            });
        }

        return res.status(500).json({ 
            success: false, 
            message: "Failed to save item to inventory database.",
            error: error.message 
        });
    }
});

// GET: Fetch All Medicines
// GET: Fetch All Medicines (scoped to pharmacyId if provided)
app.get("/api/inventory", async (req, res) => {
    try {
        const { pharmacyId } = req.query;
        const filter = pharmacyId ? { pharmacyId } : {};

        const dbItems = await Inventory.find(filter).sort({ createdAt: -1 });

        const items = dbItems.map(item => {
            return {
                id: item._id,
                _id: item._id,
                medicineBrandName: item.medicineBrandName,
                genericMoleculeName: item.genericMoleculeName,
                categoryType: item.categoryType,
                dosageStrength: item.dosageStrength,
                purchaseUnitCost: item.purchaseUnitCost,
                retailPrice: item.retailPrice,
                initialStockQty: parseNum(item.initialStockQty || 0), 
                reorderThresholdAlert: parseNum(item.reorderThresholdAlert || 0),
                skuBarcodeReference: item.skuBarcodeReference,
                expirationDate: item.expirationDate,
                supplierDistributor: item.supplierDistributor,
                pharmacyId: item.pharmacyId,
                createdAt: item.createdAt || new Date().toISOString()
            };
        });

        return res.status(200).json({
            success: true,
            count: items.length,
            data: items 
        });
    } catch (error) {
        console.error("🔴 Backend fetch failed:", error);
        return res.status(500).json({ success: false, message: "Error fetching inventory data." });
    }
});
// PUT: Update an Existing Medicine by ID
app.put("/api/inventory/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;
        console.log(`=== UPDATING MEDICINE ID: ${id} ===`);

        const updatedFields = {
            medicineBrandName: getValue(updateData.medicineBrandName, "Unknown Brand"),
            genericMoleculeName: getValue(updateData.genericMoleculeName, "Unknown Molecule"),
            categoryType: getValue(updateData.categoryType, "Uncategorized"),
            dosageStrength: getValue(updateData.dosageStrength, "N/A"),
            purchaseUnitCost: parseNum(getValue(updateData.purchaseUnitCost, 0)),
            retailPrice: parseNum(getValue(updateData.retailPrice || updateData.retailRetailPrice, 0)),
            initialStockQty: parseNum(getValue(updateData.initialStockQty, 0)),
            reorderThresholdAlert: parseNum(getValue(updateData.reorderThresholdAlert, 10)),
            skuBarcodeReference: getValue(updateData.skuBarcodeReference, ""),
            expirationDate: getValue(updateData.expirationDate, null),
            supplierDistributor: getValue(updateData.supplierDistributor, "Unknown Supplier"),
            pharmacyId: getValue(updateData.pharmacyId, "")
        };

        const updatedItem = await Inventory.findByIdAndUpdate(
            id, 
            { $set: updatedFields }, 
            { new: true, runValidators: true }
        );

        if (!updatedItem) {
            return res.status(404).json({ success: false, message: "Item not found in inventory." });
        }

        return res.status(200).json({
            success: true,
            message: "Inventory item updated successfully!",
            data: updatedItem
        });
    } catch (error) {
        console.error("🔴 Backend update failed:", error);
        
        if (error.code === 11000) {
            const duplicateField = Object.keys(error.keyValue)[0];
            return res.status(400).json({
                success: false,
                message: `Update rejected! Another item already uses this ${duplicateField}.`
            });
        }

        return res.status(500).json({ 
            success: false, 
            message: "Error updating inventory entry.",
            error: error.message 
        });
    }
});

// DELETE: Remove a Medicine by ID
app.delete("/api/inventory/:id", async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`=== DELETING MEDICINE ID: ${id} ===`);

        const deletedItem = await Inventory.findByIdAndDelete(id);

        if (!deletedItem) {
            return res.status(404).json({ success: false, message: "Item not found in inventory." });
        }

        return res.status(200).json({
            success: true,
            message: "Inventory item deleted successfully!",
            deletedItemId: id
        });
    } catch (error) {
        console.error("🔴 Backend deletion failed:", error);
        return res.status(500).json({ success: false, message: "Error deleting inventory entry." });
    }
});

// ==========================================
// 🧾 BILLS ROUTES
// ==========================================


app.post("/api/bills", async (req, res) => {
    try {
        const formData = req.body;
        console.log("=== INCOMING BILL DATA ===");
        console.log(formData);

        const newBill = await Bill.create({
            pharmacyName: getValue(formData.pharmacyName, "Unknown Pharmacy"),
            location: getValue(formData.location, "N/A"),
            panOrVat: getValue(formData.panOrVat, "N/A"),
            invoiceNo: getValue(formData.invoiceNo, `INV-${Date.now()}`),
            billTo: getValue(formData.billTo, "Anonymous Customer"),
            paymentMethod: getValue(formData.paymentMethod, "Cash"),
            date: formData.date ? new Date(formData.date) : new Date(),
            item: getValue(formData.item, "Unknown Item"),
            qty: parseNum(getValue(formData.qty, 1)),
            rate: parseNum(getValue(formData.rate, 0)),
            total: parseNum(getValue(formData.total, 0)),
            subtotal: parseNum(getValue(formData.subtotal, 0)),
            taxablePostsubdiscountSubtotal: parseNum(getValue(formData.taxablePostsubdiscountSubtotal, 0)),
            vATCollected: parseNum(getValue(formData.vATCollected, 0)),
            grandTotal: parseNum(getValue(formData.grandTotal, 0)),
            pharmacyId: formData.pharmacyId
        });

        return res.status(201).json({
            success: true,
            message: "Bill generated and saved successfully!",
            data: newBill
        });
    } catch (error) {
        console.error("🔴 BILL WRITE CRASH:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to write billing record to database.",
            error: error.message
        });
    }
});

app.get("/api/bills", async (req, res) => {
    try {
        const { pharmacyId } = req.query;
        const filter = pharmacyId ? { pharmacyId } : {};

        const dbBills = await Bill.find(filter).sort({ createdAt: -1 });

        const bills = dbBills.map(bill => {
            return {
                id: bill._id,
                _id: bill._id,
                pharmacyName: bill.pharmacyName,
                location: bill.location,
                panOrVat: bill.panOrVat,
                invoiceNo: bill.invoiceNo,
                billTo: bill.billTo,
                paymentMethod: bill.paymentMethod,
                date: bill.date,
                item: bill.item,
                qty: bill.qty,
                rate: bill.rate,
                total: bill.total,
                subtotal: bill.subtotal,
                taxablePostsubdiscountSubtotal: bill.taxablePostsubdiscountSubtotal,
                vATCollected: bill.vATCollected,
                grandTotal: bill.grandTotal,
                pharmacyId: bill.pharmacyId,
                createdAt: bill.createdAt
            };
        });

        return res.status(200).json({
            success: true,
            count: bills.length,
            data: bills
        });
    } catch (error) {
        console.error("🔴 Backend bills fetch failed:", error);
        return res.status(500).json({
            success: false,
            message: "Error fetching billing metrics from database."
        });
    }
});



app.post("/api/auth/login", async (req, res) => {
    try {
        const { pharmacyName, id, password } = req.body;

         if (!pharmacyName || !id || !password) {
           return res.status(400).json({ success: false, message: "Pharmacy name, ID and password are required." });
        }

        const pharmacy = await PharmacyUser.findOne({ id });
        if (!pharmacy) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

           const dbPharmacyName = (pharmacy.pharmacyName || "").trim().toLowerCase();
        const submittedPharmacyName = pharmacyName.trim().toLowerCase();

        if (dbPharmacyName !== submittedPharmacyName) {
            return res.status(401).json({ success: false, message: "Pharmacy name does not match our records." });
        }


        if (!pharmacy.isActive) {
            return res.status(403).json({ success: false, message: "Account is deactivated. Contact Admin." });
        }

        if (pharmacy.password !== password) {
            return res.status(401).json({ success: false, message: "Invalid credentials." });
        }

        return res.status(200).json({
            success: true,
            message: "Login successful!",
            user: {
                _id: pharmacy._id,
                id: pharmacy.id,
                pharmacyName: pharmacy.pharmacyName,
                phone: pharmacy.phone,      
                email: pharmacy.email,     
                location: pharmacy.location,
                PanOrVat: pharmacy.PanOrVat,
                isAdmin: pharmacy.isAdmin   
            }
        });

    } catch (error) {
        console.error("🔴 LOGIN ERROR:", error);
        return res.status(500).json({ success: false, message: "Server error during login." });
    }
});
/**
 * 🛠️ USED BY: ADMIN DASHBOARD
 * POST: Create/Register a new Pharmacy User account
 * URL: /api/admin/users
 */
app.post("/api/admin/users", async (req, res) => {
    try {
        const { pharmacyName, id, password, phone, email, location, PanOrVat } = req.body;

        if (!pharmacyName || !id || !password || !phone || !email || !location) {
            return res.status(400).json({ success: false, message: "All fields are required." });
        }

        const existingUser = await PharmacyUser.findOne({ id });
        if (existingUser) {
            return res.status(400).json({ success: false, message: "User ID already exists." });
        }

        const newPharmacy = await PharmacyUser.create({
            pharmacyName,
            id,
            password: password, 
            phone, 
            email,   
            location,
            PanOrVat,
            isActive: true
        });

        return res.status(201).json({
            success: true,
            message: "New pharmacy user created successfully by Admin!",
            data: newPharmacy
        });

    } catch (error) {
        console.error("🔴 ADMIN USER CREATION ERROR:", error);
        return res.status(500).json({ success: false, message: "Server error while creating user." });
    }
});
/**
 * 🛠️ USED BY: ADMIN DASHBOARD
 * GET: Fetch a single user's profile details (includes plain text password)
 * URL: /api/admin/users/:id
 */
app.get('/api/admin/users', async (req, res) => {
  try {
    const allUsers = await PharmacyUser.find({});
    // We return an array directly in 'data'
    res.json({ success: true, data: allUsers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
/**
 * 🛠️ USED BY: ADMIN DASHBOARD
 * PUT: Update user properties (includes updating password in plain text)
 * URL: /api/admin/users/:id
 */
app.put("/api/admin/users/:userId", async (req, res) => {
    try {
        const { userId } = req.params;
        const { pharmacyName, id, password, phone, email, location, PanOrVat, isActive } = req.body;

        const pharmacy = await PharmacyUser.findById(userId);
        if (!pharmacy) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        if (id && id.trim() !== pharmacy.id) {
            const existing = await PharmacyUser.findOne({ id: id.trim() });
            if (existing) {
                return res.status(400).json({ success: false, message: "That ID is already taken." });
            }
            pharmacy.id = id.trim();
        }

        if (pharmacyName) pharmacy.pharmacyName = pharmacyName;
        if (phone) pharmacy.phone = phone;
        if (email) pharmacy.email = email;
        if (location) pharmacy.location = location;
        if (PanOrVat !== undefined) pharmacy.PanOrVat = PanOrVat;
        if (password) pharmacy.password = password;
        if (isActive !== undefined) pharmacy.isActive = isActive;

        await pharmacy.save();

        return res.status(200).json({
            success: true,
            message: "Updated successfully.",
            data: {
                _id: pharmacy._id,
                id: pharmacy.id,
                pharmacyName: pharmacy.pharmacyName,
                phone: pharmacy.phone,
                email: pharmacy.email,
                location: pharmacy.location,
                PanOrVat: pharmacy.PanOrVat,
                isActive: pharmacy.isActive,
                isAdmin: pharmacy.isAdmin
            }
        });
    } catch (error) {
        console.error("🔴 UPDATE USER ERROR:", error);
        return res.status(500).json({ success: false, message: "Server error during update." });
    }
});
/**
 * 🛠️ USED BY: ADMIN DASHBOARD
 * DELETE: Completely remove a Pharmacy User account from DB
 * URL: /api/admin/users/:id
 */
app.delete("/api/admin/users/:id", async (req, res) => {
    try {
        const deletedUser = await PharmacyUser.findByIdAndDelete(req.params.id);
        if (!deletedUser) {
            return res.status(404).json({ success: false, message: "Account profile not found." });
        }

        return res.status(200).json({
            success: true,
            message: "Pharmacy account permanently deleted by Admin."
        });
    } catch (error) {
        console.error("🔴 ADMIN DELETE USER ERROR:", error);
        return res.status(500).json({ success: false, message: "Error deleting account." });
    }
});

// ==========================================
// 👥 STAFF ROUTES (PharmacyStaff collection ONLY — never PharmacyUser)
// ==========================================

// 1. CREATE: Add new staff login for a specific pharmacy
app.post("/api/staff/login", async (req, res) => {
    const { id, password, pharmacyName } = req.body;
    const staff = await PharmacyStaff.findOne({ id, pharmacyName });
    
    if (staff && staff.password === password) {
        if (staff.isActive === false) {
            return res.status(403).json({ 
                message: "Your account is deactivated. Only active staff can log in." 
            });
        }
        
        res.json({ 
            token: "mock-jwt-token", 
            user: { id: staff.id, staffName: staff.staffName, role: staff.role, pharmacyName: staff.pharmacyName } 
        });
    } else {
        res.status(401).json({ message: "Invalid credentials" });
    }
});


app.post("/api/auth/verify", async (req, res) => {
    const { token, id } = req.body;

    // staff/legacy path
    if (token === "mock-jwt-token") {
        return res.json({ 
            success: true, 
            user: { id: "admin", role: "Manager", pharmacyName: "Your Pharmacy" } 
        });
    }

    // pharmacy path — actually check the DB instead of a hardcoded string
    if (id) {
        const pharmacy = await PharmacyUser.findOne({ id });
        if (pharmacy && pharmacy.isActive) {
            return res.json({
                success: true,
                user: {
                    _id: pharmacy._id,
                    id: pharmacy.id,
                    pharmacyName: pharmacy.pharmacyName,
                    isAdmin: pharmacy.isAdmin
                }
            });
        }
    }

    return res.status(401).json({ success: false, message: "Invalid token" });
});


app.post("/api/staff/create", async (req, res) => {
    try {
        const staffData = req.body;
        const newStaff = await PharmacyStaff.create(staffData);
        res.status(201).json({ success: true, message: "Staff created", data: newStaff });
    } catch (error) {
        res.status(500).json({ error: "Creation failed" });
    }
});

// 2. READ: Get staff ONLY for the pharmacy that was clicked in the dashboard
app.get("/api/admin/staff-by-pharmacy/:pharmacyName", async (req, res) => {
    try {
        const staff = await PharmacyStaff.find({ pharmacyName: req.params.pharmacyName });
        res.status(200).json({ success: true, data: staff });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error fetching staff" });
    }
});

// 3. UPDATE: Update staff by ID (the MongoDB _id)
app.put("/api/staff/:id", async (req, res) => {
    try {
        const updatedStaff = await PharmacyStaff.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );
        if (!updatedStaff) {
            return res.status(404).json({ error: "Staff member not found" });
        }
        res.status(200).json({ success: true, data: updatedStaff });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 4. DELETE: Remove staff by ID
app.delete("/api/staff/:id", async (req, res) => {
    try {
        const deleted = await PharmacyStaff.findByIdAndDelete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ error: "Staff member not found" });
        }
        res.status(200).json({ message: "Staff member deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete staff" });
    }
});

// Start DB connection before starting server
conectDb().then(() => {
    app.listen(PORT, () => {
        console.log(`📡 Clinic & Inventory Combined Backend online at: http://localhost:${PORT}`);
    }); 
}).catch((err) => {
    console.error("❌ Critical System Halt: Server could not start because Database connection failed.");
});