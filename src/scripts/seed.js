require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const connectToDb = require("../config/db");
const { User } = require("../models/user.model");

async function seedUsers() {
    try {
        console.log("Connecting to database for seeding...");
        connectToDb();

        await new Promise((resolve) => {
            if (mongoose.connection.readyState === 1) return resolve();
            mongoose.connection.once("open", resolve);
        });

        const adminEmail = (process.env.SEED_ADMIN_EMAIL || "admin@example.com").toLowerCase().trim();
        const adminPassword = process.env.SEED_ADMIN_PASSWORD || "AdminSecure123!";

        const supportEmail = (process.env.SEED_SUPPORT_EMAIL || "support@example.com").toLowerCase().trim();
        const supportPassword = process.env.SEED_SUPPORT_PASSWORD || "SupportSecure123!";

        // Seed Admin Account
        let adminUser = await User.findOne({ email: adminEmail });
        if (!adminUser) {
            const passwordHash = await bcrypt.hash(adminPassword, 12);
            adminUser = await User.create({
                name: "System Administrator",
                email: adminEmail,
                passwordHash,
                role: "admin",
                isActive: true,
            });
            console.log(`[SEED] Admin account created successfully (${adminEmail})`);
        } else {
            console.log(`[SEED] Admin account already exists (${adminEmail})`);
        }

        // Seed Support Account
        let supportUser = await User.findOne({ email: supportEmail });
        if (!supportUser) {
            const passwordHash = await bcrypt.hash(supportPassword, 12);
            supportUser = await User.create({
                name: "Customer Support Staff",
                email: supportEmail,
                passwordHash,
                role: "support",
                isActive: true,
            });
            console.log(`[SEED] Support account created successfully (${supportEmail})`);
        } else {
            console.log(`[SEED] Support account already exists (${supportEmail})`);
        }

        console.log("Database seeding completed successfully.");
    } catch (err) {
        console.error("Database seeding failed:", err);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        process.exit(0);
    }
}

seedUsers();
