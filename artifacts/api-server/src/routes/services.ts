import { Router, type IRouter } from "express";

const router: IRouter = Router();

const SERVICES = [
  {
    id: "temple-attunement",
    name: "Temple Attunement",
    duration: 90,
    price: 220,
    tagline: "Ninety minutes to listen, respond, and shape the work around what your body needs that day.",
    description:
      "A 90-minute session gives us time to do more than simply work where it hurts. Each session is shaped around what your body needs that day, combining skilled therapeutic touch, an understanding of body mechanics, and an intuitive approach to areas of tension and restriction.",
  },
  {
    id: "reiki-plus",
    name: "Reiki+",
    duration: 60,
    price: 180,
    tagline: "A quieter way to slow down, reconnect, and find a greater sense of grounding.",
    description:
      "Reiki combines traditional practice with chakra awareness and meridian-based principles from Traditional Chinese Medicine (TCM), using a gentle, intuitive approach to support relaxation, grounding, and connection with yourself. The session does not rely on muscle manipulation or therapeutic pressure. Includes a 10-minute intake followed by 50 minutes of Reiki.",
  },
];

router.get("/services", (_req, res) => {
  res.json(SERVICES);
});

export default router;
