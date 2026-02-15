import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, FileText, Trash2, Copy, Building2, Calendar, Lock } from "lucide-react";
import { useProjects, useCreateProject, useDeleteProject } from "@/lib/hooks";
import { formatCurrency } from "@/lib/calculations";
import type { Project } from "@shared/schema";

export default function Dashboard() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const { data: projects, isLoading } = useProjects();
  const createProject = useCreateProject();
  const deleteProject = useDeleteProject();

  const filtered = (projects || []).filter((p) => {
    const q = search.toLowerCase();
    return (
      p.projectName.toLowerCase().includes(q) ||
      (p.customerCompany || "").toLowerCase().includes(q) ||
      (p.estimatedBy || "").toLowerCase().includes(q)
    );
  });

  const handleCreate = async () => {
    const result = await createProject.mutateAsync({
      projectName: "New Estimate",
    });
    navigate(`/project/${result.id}`);
  };

  const handleDuplicate = async (project: Project) => {
    const { id, createdAt, updatedAt, ...rest } = project;
    const result = await createProject.mutateAsync({
      ...rest,
      projectName: `${project.projectName} (Copy)`,
      status: "draft",
    });
    navigate(`/project/${result.id}`);
  };

  const handleDelete = async () => {
    if (deleteId !== null) {
      await deleteProject.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 py-5 sm:px-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold tracking-tight" data-testid="text-app-title">
                Berger Iron Works
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">Steel Estimator</p>
            </div>
            <Button onClick={handleCreate} disabled={createProject.isPending} data-testid="button-new-project">
              <Plus className="w-4 h-4 mr-2" />
              New Estimate
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6">
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-projects"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-32 mt-2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4 mt-2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="text-center py-16">
            <CardContent>
              <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-1">
                {search ? "No matching projects" : "No estimates yet"}
              </h3>
              <p className="text-muted-foreground text-sm mb-4">
                {search
                  ? "Try a different search term"
                  : "Create your first steel estimate to get started"}
              </p>
              {!search && (
                <Button onClick={handleCreate} disabled={createProject.isPending} data-testid="button-create-first">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Estimate
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((project) => (
              <Card
                key={project.id}
                className="hover-elevate cursor-pointer group"
                onClick={() => navigate(`/project/${project.id}`)}
                data-testid={`card-project-${project.id}`}
              >
                <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate" data-testid={`text-project-name-${project.id}`}>
                      {project.projectName}
                    </CardTitle>
                    {project.customerCompany && (
                      <div className="flex items-center gap-1.5 mt-1.5 text-sm text-muted-foreground">
                        <Building2 className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{project.customerCompany}</span>
                      </div>
                    )}
                  </div>
                  <Badge
                    variant={project.status === "locked" ? "secondary" : "outline"}
                    className="shrink-0"
                  >
                    {project.status === "locked" && <Lock className="w-3 h-3 mr-1" />}
                    {project.status === "locked" ? "Locked" : "Draft"}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                    {project.estimateDate && (
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {project.estimateDate}
                      </div>
                    )}
                    {project.estimatedBy && (
                      <span>by {project.estimatedBy}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 justify-end flex-wrap">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDuplicate(project);
                      }}
                      data-testid={`button-duplicate-${project.id}`}
                    >
                      <Copy className="w-3.5 h-3.5 mr-1.5" />
                      Duplicate
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteId(project.id);
                      }}
                      data-testid={`button-delete-${project.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Estimate</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this estimate and all its data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground" data-testid="button-confirm-delete">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
