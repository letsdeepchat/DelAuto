const express = require("express");
const router = express.Router();
const Delivery = require("../../database/models/Delivery");
const { asyncHandler } = require("../middleware/errorHandler");

/**
 * @swagger
 * tags:
 *   name: Deliveries
 *   description: Delivery management endpoints
 */

/**
 * @swagger
 * /api/deliveries:
 *   get:
 *     summary: Get all deliveries
 *     tags: [Deliveries]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of deliveries
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Delivery'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/deliveries/{id}:
 *   get:
 *     summary: Get delivery by ID
 *     tags: [Deliveries]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Delivery ID
 *     responses:
 *       200:
 *         description: Delivery details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Delivery'
 *       404:
 *         description: Delivery not found
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/deliveries:
 *   post:
 *     summary: Create new delivery
 *     tags: [Deliveries]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customer_id
 *               - address
 *               - scheduled_time
 *             properties:
 *               customer_id:
 *                 type: string
 *                 description: Customer ID
 *               agent_id:
 *                 type: string
 *                 description: Agent ID (optional)
 *               address:
 *                 type: string
 *                 description: Delivery address
 *               scheduled_time:
 *                 type: string
 *                 format: date-time
 *                 description: Scheduled delivery time
 *     responses:
 *       201:
 *         description: Delivery created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Delivery'
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal server error
 */

// GET /api/deliveries - Get all deliveries
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const deliveries = await Delivery.find()
      .populate("customer_id")
      .populate("agent_id")
      .sort({ scheduled_time: -1 });
    res.json(deliveries);
  }),
);

// GET /api/deliveries/:id - Get delivery by ID
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const delivery = await Delivery.findById(id)
      .populate("customer_id")
      .populate("agent_id");

    if (!delivery) {
      const { NotFoundError } = require("../middleware/errorHandler");
      throw new NotFoundError("Delivery");
    }

    res.json(delivery);
  }),
);

// POST /api/deliveries - Create new delivery
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { customer_id, agent_id, address, scheduled_time } = req.body;

    const delivery = new Delivery({
      customer_id,
      agent_id,
      address,
      scheduled_time,
    });

    await delivery.save();
    await delivery.populate("customer_id").populate("agent_id").execPopulate();

    res.status(201).json(delivery);
  }),
);

// PUT /api/deliveries/:id - Update delivery
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { customer_id, agent_id, address, scheduled_time, status } = req.body;

    const delivery = await Delivery.findByIdAndUpdate(
      id,
      { customer_id, agent_id, address, scheduled_time, status },
      { new: true, runValidators: true },
    )
      .populate("customer_id")
      .populate("agent_id");

    if (!delivery) {
      const { NotFoundError } = require("../middleware/errorHandler");
      throw new NotFoundError("Delivery");
    }

    res.json(delivery);
  }),
);

// DELETE /api/deliveries/:id - Delete delivery
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const delivery = await Delivery.findByIdAndDelete(id);

    if (!delivery) {
      const { NotFoundError } = require("../middleware/errorHandler");
      throw new NotFoundError("Delivery");
    }

    res.json({ message: "Delivery deleted successfully" });
  }),
);

module.exports = router;
