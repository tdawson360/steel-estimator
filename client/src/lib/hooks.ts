import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "./queryClient";
import type { Project, EstimateItem, Material, RecapCost, SummaryAdjustment } from "@shared/schema";

export function useProjects() {
  return useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });
}

export function useProject(id: number | null) {
  return useQuery<Project>({
    queryKey: ["/api/projects", id],
    enabled: id !== null,
  });
}

export function useEstimateItems(projectId: number | null) {
  return useQuery<EstimateItem[]>({
    queryKey: ["/api/projects", projectId, "items"],
    enabled: projectId !== null,
  });
}

export function useMaterials(itemId: number | null) {
  return useQuery<Material[]>({
    queryKey: ["/api/items", itemId, "materials"],
    enabled: itemId !== null,
  });
}

export function useAllMaterials(projectId: number | null) {
  return useQuery<Record<number, Material[]>>({
    queryKey: ["/api/projects", projectId, "materials"],
    enabled: projectId !== null,
  });
}

export function useRecapCosts(projectId: number | null) {
  return useQuery<Record<number, RecapCost>>({
    queryKey: ["/api/projects", projectId, "recap"],
    enabled: projectId !== null,
  });
}

export function useAdjustments(projectId: number | null) {
  return useQuery<SummaryAdjustment[]>({
    queryKey: ["/api/projects", projectId, "adjustments"],
    enabled: projectId !== null,
  });
}

export function useCreateProject() {
  return useMutation({
    mutationFn: async (data: Partial<Project>) => {
      const res = await apiRequest("POST", "/api/projects", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
  });
}

export function useUpdateProject(id: number) {
  return useMutation({
    mutationFn: async (data: Partial<Project>) => {
      const res = await apiRequest("PATCH", `/api/projects/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
  });
}

export function useDeleteProject() {
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
  });
}

export function useCreateItem(projectId: number) {
  return useMutation({
    mutationFn: async (data: Partial<EstimateItem>) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/items`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "materials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "recap"] });
    },
  });
}

export function useUpdateItem(projectId: number) {
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<EstimateItem> & { id: number }) => {
      const res = await apiRequest("PATCH", `/api/items/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "materials"] });
    },
  });
}

export function useDeleteItem(projectId: number) {
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "materials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "recap"] });
    },
  });
}

export function useCreateMaterial(projectId: number, itemId: number) {
  return useMutation({
    mutationFn: async (data: Partial<Material>) => {
      const res = await apiRequest("POST", `/api/items/${itemId}/materials`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", itemId, "materials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "materials"] });
    },
  });
}

export function useUpdateMaterial(projectId: number, itemId: number) {
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<Material> & { id: number }) => {
      const res = await apiRequest("PATCH", `/api/materials/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", itemId, "materials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "materials"] });
    },
  });
}

export function useDeleteMaterial(projectId: number, itemId: number) {
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/materials/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", itemId, "materials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "materials"] });
    },
  });
}

export function useUpdateRecap(projectId: number) {
  return useMutation({
    mutationFn: async ({ itemId, ...data }: Partial<RecapCost> & { itemId: number }) => {
      const res = await apiRequest("PUT", `/api/items/${itemId}/recap`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "recap"] });
    },
  });
}

export function useCreateAdjustment(projectId: number) {
  return useMutation({
    mutationFn: async (data: Partial<SummaryAdjustment>) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/adjustments`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "adjustments"] });
    },
  });
}

export function useUpdateAdjustment(projectId: number) {
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<SummaryAdjustment> & { id: number }) => {
      const res = await apiRequest("PATCH", `/api/adjustments/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "adjustments"] });
    },
  });
}

export function useDeleteAdjustment(projectId: number) {
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/adjustments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "adjustments"] });
    },
  });
}
