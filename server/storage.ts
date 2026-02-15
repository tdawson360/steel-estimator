import { eq, desc } from "drizzle-orm";
import { db } from "./db";
import {
  projects, estimateItems, materials, recapCosts, summaryAdjustments,
  type Project, type InsertProject,
  type EstimateItem, type InsertEstimateItem,
  type Material, type InsertMaterial,
  type RecapCost, type InsertRecapCost,
  type SummaryAdjustment, type InsertSummaryAdjustment,
} from "@shared/schema";

export interface IStorage {
  getProjects(): Promise<Project[]>;
  getProject(id: number): Promise<Project | undefined>;
  createProject(data: InsertProject): Promise<Project>;
  updateProject(id: number, data: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(id: number): Promise<void>;

  getEstimateItems(projectId: number): Promise<EstimateItem[]>;
  createEstimateItem(data: InsertEstimateItem): Promise<EstimateItem>;
  updateEstimateItem(id: number, data: Partial<InsertEstimateItem>): Promise<EstimateItem | undefined>;
  deleteEstimateItem(id: number): Promise<void>;

  getMaterialsByItem(itemId: number): Promise<Material[]>;
  getMaterialsByProject(projectId: number): Promise<Record<number, Material[]>>;
  createMaterial(data: InsertMaterial): Promise<Material>;
  updateMaterial(id: number, data: Partial<InsertMaterial>): Promise<Material | undefined>;
  deleteMaterial(id: number): Promise<void>;

  getRecapCostsByProject(projectId: number): Promise<Record<number, RecapCost>>;
  upsertRecapCost(itemId: number, data: Partial<InsertRecapCost>): Promise<RecapCost>;

  getAdjustments(projectId: number): Promise<SummaryAdjustment[]>;
  createAdjustment(data: InsertSummaryAdjustment): Promise<SummaryAdjustment>;
  updateAdjustment(id: number, data: Partial<InsertSummaryAdjustment>): Promise<SummaryAdjustment | undefined>;
  deleteAdjustment(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getProjects(): Promise<Project[]> {
    return db.select().from(projects).orderBy(desc(projects.updatedAt));
  }

  async getProject(id: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async createProject(data: InsertProject): Promise<Project> {
    const [project] = await db.insert(projects).values(data).returning();
    return project;
  }

  async updateProject(id: number, data: Partial<InsertProject>): Promise<Project | undefined> {
    const [project] = await db
      .update(projects)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return project;
  }

  async deleteProject(id: number): Promise<void> {
    const items = await this.getEstimateItems(id);
    for (const item of items) {
      await db.delete(materials).where(eq(materials.itemId, item.id));
      await db.delete(recapCosts).where(eq(recapCosts.itemId, item.id));
    }
    await db.delete(estimateItems).where(eq(estimateItems.projectId, id));
    await db.delete(summaryAdjustments).where(eq(summaryAdjustments.projectId, id));
    await db.delete(projects).where(eq(projects.id, id));
  }

  async getEstimateItems(projectId: number): Promise<EstimateItem[]> {
    return db.select().from(estimateItems).where(eq(estimateItems.projectId, projectId)).orderBy(estimateItems.sortOrder);
  }

  async createEstimateItem(data: InsertEstimateItem): Promise<EstimateItem> {
    const [item] = await db.insert(estimateItems).values(data).returning();
    return item;
  }

  async updateEstimateItem(id: number, data: Partial<InsertEstimateItem>): Promise<EstimateItem | undefined> {
    const [item] = await db.update(estimateItems).set(data).where(eq(estimateItems.id, id)).returning();
    return item;
  }

  async deleteEstimateItem(id: number): Promise<void> {
    await db.delete(materials).where(eq(materials.itemId, id));
    await db.delete(recapCosts).where(eq(recapCosts.itemId, id));
    await db.delete(estimateItems).where(eq(estimateItems.id, id));
  }

  async getMaterialsByItem(itemId: number): Promise<Material[]> {
    return db.select().from(materials).where(eq(materials.itemId, itemId)).orderBy(materials.sortOrder);
  }

  async getMaterialsByProject(projectId: number): Promise<Record<number, Material[]>> {
    const items = await this.getEstimateItems(projectId);
    const result: Record<number, Material[]> = {};
    for (const item of items) {
      result[item.id] = await this.getMaterialsByItem(item.id);
    }
    return result;
  }

  async createMaterial(data: InsertMaterial): Promise<Material> {
    const [mat] = await db.insert(materials).values(data).returning();
    return mat;
  }

  async updateMaterial(id: number, data: Partial<InsertMaterial>): Promise<Material | undefined> {
    const [mat] = await db.update(materials).set(data).where(eq(materials.id, id)).returning();
    return mat;
  }

  async deleteMaterial(id: number): Promise<void> {
    await db.delete(materials).where(eq(materials.id, id));
  }

  async getRecapCostsByProject(projectId: number): Promise<Record<number, RecapCost>> {
    const items = await this.getEstimateItems(projectId);
    const result: Record<number, RecapCost> = {};
    for (const item of items) {
      const [recap] = await db.select().from(recapCosts).where(eq(recapCosts.itemId, item.id));
      if (recap) {
        result[item.id] = recap;
      }
    }
    return result;
  }

  async upsertRecapCost(itemId: number, data: Partial<InsertRecapCost>): Promise<RecapCost> {
    const [existing] = await db.select().from(recapCosts).where(eq(recapCosts.itemId, itemId));
    if (existing) {
      const [updated] = await db.update(recapCosts).set(data).where(eq(recapCosts.itemId, itemId)).returning();
      return updated;
    } else {
      const [created] = await db.insert(recapCosts).values({ ...data, itemId }).returning();
      return created;
    }
  }

  async getAdjustments(projectId: number): Promise<SummaryAdjustment[]> {
    return db.select().from(summaryAdjustments).where(eq(summaryAdjustments.projectId, projectId)).orderBy(summaryAdjustments.sortOrder);
  }

  async createAdjustment(data: InsertSummaryAdjustment): Promise<SummaryAdjustment> {
    const [adj] = await db.insert(summaryAdjustments).values(data).returning();
    return adj;
  }

  async updateAdjustment(id: number, data: Partial<InsertSummaryAdjustment>): Promise<SummaryAdjustment | undefined> {
    const [adj] = await db.update(summaryAdjustments).set(data).where(eq(summaryAdjustments.id, id)).returning();
    return adj;
  }

  async deleteAdjustment(id: number): Promise<void> {
    await db.delete(summaryAdjustments).where(eq(summaryAdjustments.id, id));
  }
}

export const storage = new DatabaseStorage();
