import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Projects
  app.get("/api/projects", async (_req, res) => {
    const projects = await storage.getProjects();
    res.json(projects);
  });

  app.get("/api/projects/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const project = await storage.getProject(id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    res.json(project);
  });

  app.post("/api/projects", async (req, res) => {
    const project = await storage.createProject(req.body);
    res.status(201).json(project);
  });

  app.patch("/api/projects/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const project = await storage.updateProject(id, req.body);
    if (!project) return res.status(404).json({ message: "Project not found" });
    res.json(project);
  });

  app.delete("/api/projects/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    await storage.deleteProject(id);
    res.status(204).send();
  });

  // Estimate Items
  app.get("/api/projects/:id/items", async (req, res) => {
    const projectId = parseInt(req.params.id);
    const items = await storage.getEstimateItems(projectId);
    res.json(items);
  });

  app.post("/api/projects/:id/items", async (req, res) => {
    const projectId = parseInt(req.params.id);
    const item = await storage.createEstimateItem({ ...req.body, projectId });
    res.status(201).json(item);
  });

  app.patch("/api/items/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const item = await storage.updateEstimateItem(id, req.body);
    if (!item) return res.status(404).json({ message: "Item not found" });
    res.json(item);
  });

  app.delete("/api/items/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    await storage.deleteEstimateItem(id);
    res.status(204).send();
  });

  // Materials
  app.get("/api/items/:id/materials", async (req, res) => {
    const itemId = parseInt(req.params.id);
    const mats = await storage.getMaterialsByItem(itemId);
    res.json(mats);
  });

  app.get("/api/projects/:id/materials", async (req, res) => {
    const projectId = parseInt(req.params.id);
    const mats = await storage.getMaterialsByProject(projectId);
    res.json(mats);
  });

  app.post("/api/items/:id/materials", async (req, res) => {
    const itemId = parseInt(req.params.id);
    const mat = await storage.createMaterial({ ...req.body, itemId });
    res.status(201).json(mat);
  });

  app.patch("/api/materials/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const mat = await storage.updateMaterial(id, req.body);
    if (!mat) return res.status(404).json({ message: "Material not found" });
    res.json(mat);
  });

  app.delete("/api/materials/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    await storage.deleteMaterial(id);
    res.status(204).send();
  });

  // Recap Costs
  app.get("/api/projects/:id/recap", async (req, res) => {
    const projectId = parseInt(req.params.id);
    const recap = await storage.getRecapCostsByProject(projectId);
    res.json(recap);
  });

  app.put("/api/items/:id/recap", async (req, res) => {
    const itemId = parseInt(req.params.id);
    const recap = await storage.upsertRecapCost(itemId, req.body);
    res.json(recap);
  });

  // Summary Adjustments
  app.get("/api/projects/:id/adjustments", async (req, res) => {
    const projectId = parseInt(req.params.id);
    const adjs = await storage.getAdjustments(projectId);
    res.json(adjs);
  });

  app.post("/api/projects/:id/adjustments", async (req, res) => {
    const projectId = parseInt(req.params.id);
    const adj = await storage.createAdjustment({ ...req.body, projectId });
    res.status(201).json(adj);
  });

  app.patch("/api/adjustments/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const adj = await storage.updateAdjustment(id, req.body);
    if (!adj) return res.status(404).json({ message: "Adjustment not found" });
    res.json(adj);
  });

  app.delete("/api/adjustments/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    await storage.deleteAdjustment(id);
    res.status(204).send();
  });

  return httpServer;
}
