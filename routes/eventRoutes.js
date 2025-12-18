const express = require("express");
const Event = require("../models/Event");
const auth = require("../middleware/authMiddleware");
const multer = require("multer");
const path = require("path");

const router = express.Router();

/* ====================== MULTER CONFIG ====================== */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname))
});

const upload = multer({ storage });

/* ====================== CREATE EVENT ====================== */
router.post("/", auth, upload.single("image"), async (req, res) => {
  try {
    const event = new Event({
      title: req.body.title,
      description: req.body.description,
      date: req.body.date,
      location: req.body.location,
      capacity: req.body.capacity,
      image: req.file ? req.file.filename : null,
      createdBy: req.userId,
      attendees: []
    });

    await event.save();
    res.status(201).json(event);
  } catch (err) {
    res.status(500).json({ message: "Event creation failed" });
  }
});

/* ====================== GET ALL EVENTS ====================== */
router.get("/", async (req, res) => {
  try {
    const events = await Event.find()
      .populate("attendees", "name email")
      .populate("createdBy", "_id name");

    res.json(events);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch events" });
  }
});

/* ====================== GET SINGLE EVENT ====================== */
router.get("/:id", auth, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: "Event not found" });
    res.json(event);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch event" });
  }
});

/* ====================== REGISTER FOR EVENT (RACE-SAFE RSVP) ====================== */
router.post("/register/:id", auth, async (req, res) => {
  try {
    const userId = req.userId;
    const eventId = req.params.id;

    const event = await Event.findOneAndUpdate(
      {
        _id: eventId,

        // prevent duplicate RSVP
        attendees: { $ne: userId },

        // enforce capacity atomically
        $expr: {
          $lt: [{ $size: "$attendees" }, "$capacity"]
        }
      },
      {
        $addToSet: { attendees: userId }
      },
      { new: true }
    );

    if (!event) {
      return res.status(400).json({
        message: "Event is full or already registered"
      });
    }

    res.json({
      message: "Registered successfully",
      attendeesCount: event.attendees.length
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to register for event" });
  }
});

/* ====================== UNREGISTER FROM EVENT ====================== */
router.delete("/register/:id", auth, async (req, res) => {
  try {
    const userId = req.userId;
    const eventId = req.params.id;

    const event = await Event.findByIdAndUpdate(
      eventId,
      { $pull: { attendees: userId } },
      { new: true }
    );

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    res.json({
      message: "Unregistered successfully",
      attendeesCount: event.attendees.length
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to unregister" });
  }
});

/* ====================== UPDATE EVENT ====================== */
router.put("/:id", auth, upload.single("image"), async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: "Event not found" });

    if (event.createdBy.toString() !== req.userId)
      return res.status(403).json({ message: "Unauthorized" });

    event.title = req.body.title || event.title;
    event.description = req.body.description || event.description;
    event.date = req.body.date || event.date;
    event.location = req.body.location || event.location;
    event.capacity = req.body.capacity || event.capacity;
    if (req.file) event.image = req.file.filename;

    await event.save();
    res.json({ message: "Event updated successfully", event });
  } catch (err) {
    res.status(500).json({ message: "Event update failed" });
  }
});

/* ====================== DELETE EVENT ====================== */
router.delete("/:id", auth, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: "Event not found" });

    if (event.createdBy.toString() !== req.userId)
      return res.status(403).json({ message: "Unauthorized" });

    await event.deleteOne();
    res.json({ message: "Event deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Event deletion failed" });
  }
});

module.exports = router;
