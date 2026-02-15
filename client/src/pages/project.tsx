import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Save } from "lucide-react";
import { useProject, useEstimateItems, useAllMaterials, useRecapCosts, useAdjustments } from "@/lib/hooks";
import ProjectInfoTab from "@/components/project-info-tab";
import EstimateTab from "@/components/estimate-tab";
import StockListTab from "@/components/stock-list-tab";
import RecapTab from "@/components/recap-tab";
import SummaryTab from "@/components/summary-tab";
import QuoteTab from "@/components/quote-tab";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const projectId = parseInt(id || "0");
  const [activeTab, setActiveTab] = useState("info");

  const { data: project, isLoading: projectLoading } = useProject(projectId);
  const { data: items, isLoading: itemsLoading } = useEstimateItems(projectId);
  const { data: allMaterials, isLoading: materialsLoading } = useAllMaterials(projectId);
  const { data: recapCosts, isLoading: recapLoading } = useRecapCosts(projectId);
  const { data: adjustments, isLoading: adjLoading } = useAdjustments(projectId);

  const isLoading = projectLoading || itemsLoading || materialsLoading || recapLoading || adjLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card">
          <div className="max-w-[1400px] mx-auto px-4 py-4">
            <Skeleton className="h-6 w-64" />
          </div>
        </header>
        <main className="max-w-[1400px] mx-auto px-4 py-6">
          <Skeleton className="h-10 w-full mb-4" />
          <Skeleton className="h-96 w-full" />
        </main>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-medium mb-2">Project not found</h2>
          <Button variant="outline" onClick={() => navigate("/")} data-testid="button-back-to-dashboard">
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold truncate" data-testid="text-project-title">
              {project.projectName || "Untitled Estimate"}
            </h1>
            {project.customerCompany && (
              <p className="text-xs text-muted-foreground truncate">{project.customerCompany}</p>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 py-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto flex-nowrap mb-4" data-testid="tabs-navigation">
            <TabsTrigger value="info" data-testid="tab-info">Project Info</TabsTrigger>
            <TabsTrigger value="estimate" data-testid="tab-estimate">Estimate</TabsTrigger>
            <TabsTrigger value="stocklist" data-testid="tab-stocklist">Stock List</TabsTrigger>
            <TabsTrigger value="recap" data-testid="tab-recap">Recap</TabsTrigger>
            <TabsTrigger value="summary" data-testid="tab-summary">Summary</TabsTrigger>
            <TabsTrigger value="quote" data-testid="tab-quote">Quote</TabsTrigger>
          </TabsList>

          <TabsContent value="info">
            <ProjectInfoTab project={project} />
          </TabsContent>
          <TabsContent value="estimate">
            <EstimateTab
              project={project}
              items={items || []}
              allMaterials={allMaterials || {}}
            />
          </TabsContent>
          <TabsContent value="stocklist">
            <StockListTab
              items={items || []}
              allMaterials={allMaterials || {}}
            />
          </TabsContent>
          <TabsContent value="recap">
            <RecapTab
              project={project}
              items={items || []}
              allMaterials={allMaterials || {}}
              recapCosts={recapCosts || {}}
            />
          </TabsContent>
          <TabsContent value="summary">
            <SummaryTab
              project={project}
              items={items || []}
              allMaterials={allMaterials || {}}
              recapCosts={recapCosts || {}}
              adjustments={adjustments || []}
            />
          </TabsContent>
          <TabsContent value="quote">
            <QuoteTab
              project={project}
              items={items || []}
              allMaterials={allMaterials || {}}
              recapCosts={recapCosts || {}}
              adjustments={adjustments || []}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
