import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, BarChart3 } from "lucide-react";
import { useCreateAdjustment, useUpdateAdjustment, useDeleteAdjustment } from "@/lib/hooks";
import {
  calcItemTotal, calcItemMaterialCost, calcItemFabCost,
  calcRecapTotal, calcTax, formatCurrency
} from "@/lib/calculations";
import { TAX_CATEGORIES, BREAKOUT_GROUPS } from "@shared/schema";
import type { Project, EstimateItem, Material, RecapCost, SummaryAdjustment } from "@shared/schema";

interface Props {
  project: Project;
  items: EstimateItem[];
  allMaterials: Record<number, Material[]>;
  recapCosts: Record<number, RecapCost>;
  adjustments: SummaryAdjustment[];
}

export default function SummaryTab({ project, items, allMaterials, recapCosts, adjustments }: Props) {
  const createAdj = useCreateAdjustment(project.id);
  const updateAdj = useUpdateAdjustment(project.id);
  const deleteAdj = useDeleteAdjustment(project.id);

  const taxCat = TAX_CATEGORIES[(project.taxCategory || "new_construction") as keyof typeof TAX_CATEGORIES];

  const itemSummaries = items.map((item) => {
    const mats = allMaterials[item.id] || [];
    const recap = recapCosts[item.id] || {} as RecapCost;
    const matCost = calcItemMaterialCost(mats);
    const fabCost = calcItemFabCost(mats, item);
    const estimateTotal = calcItemTotal(mats, item);
    const recapTotal = calcRecapTotal(recap);
    const tax = calcTax(project.taxCategory || "new_construction", matCost, fabCost);
    return {
      item,
      matCost,
      fabCost,
      estimateTotal,
      recapTotal,
      tax,
      total: estimateTotal + recapTotal + tax,
    };
  });

  const totalMaterial = itemSummaries.reduce((s, i) => s + i.matCost, 0);
  const totalFab = itemSummaries.reduce((s, i) => s + i.fabCost, 0);
  const totalEstimate = itemSummaries.reduce((s, i) => s + i.estimateTotal, 0);
  const totalRecap = itemSummaries.reduce((s, i) => s + i.recapTotal, 0);
  const totalTax = itemSummaries.reduce((s, i) => s + i.tax, 0);
  const adjustmentTotal = adjustments.reduce((s, a) => s + (a.amount || 0), 0);
  const subtotal = itemSummaries.reduce((s, i) => s + i.total, 0);
  const grandTotal = subtotal + adjustmentTotal;

  const baseItems = itemSummaries.filter((s) => (s.item.breakoutGroup || "base") === "base");
  const deductItems = itemSummaries.filter((s) => s.item.breakoutGroup === "deduct");
  const addItems = itemSummaries.filter((s) => s.item.breakoutGroup === "add");

  const baseBid = baseItems.reduce((s, i) => s + i.total, 0) + adjustmentTotal;
  const deductTotal = deductItems.reduce((s, i) => s + i.total, 0);
  const addTotal = addItems.reduce((s, i) => s + i.total, 0);

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          Summary
        </h2>
        <Badge variant="outline">{taxCat?.label}</Badge>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Item Cost Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead className="text-right">Materials</TableHead>
                  <TableHead className="text-right">Fabrication</TableHead>
                  <TableHead className="text-right">Estimate</TableHead>
                  <TableHead className="text-right">Recap</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itemSummaries.map((s) => (
                  <TableRow key={s.item.id}>
                    <TableCell className="font-medium" data-testid={`text-summary-item-${s.item.id}`}>{s.item.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">{s.item.breakoutGroup || "base"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(s.matCost)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(s.fabCost)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(s.estimateTotal)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(s.recapTotal)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(s.tax)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(s.total)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 font-bold">
                  <TableCell colSpan={2}>Totals</TableCell>
                  <TableCell className="text-right">{formatCurrency(totalMaterial)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(totalFab)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(totalEstimate)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(totalRecap)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(totalTax)}</TableCell>
                  <TableCell className="text-right text-primary">{formatCurrency(subtotal)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base">General Adjustments</CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => createAdj.mutate({ projectId: project.id, description: "Adjustment", amount: 0 })}
              data-testid="button-add-adjustment"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add Adjustment
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Internal-only adjustments baked into the total. Not shown on the quote.</p>
        </CardHeader>
        <CardContent>
          {adjustments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No adjustments</p>
          ) : (
            <div className="space-y-2">
              {adjustments.map((adj) => (
                <div key={adj.id} className="flex items-center gap-3">
                  <Input
                    value={adj.description}
                    onChange={(e) => updateAdj.mutate({ id: adj.id, description: e.target.value })}
                    className="flex-1"
                    placeholder="Description"
                    data-testid={`input-adj-desc-${adj.id}`}
                  />
                  <Input
                    type="number"
                    value={adj.amount || ""}
                    onChange={(e) => updateAdj.mutate({ id: adj.id, amount: parseFloat(e.target.value) || 0 })}
                    className="w-32"
                    placeholder="$0.00"
                    data-testid={`input-adj-amount-${adj.id}`}
                  />
                  <Button size="icon" variant="ghost" onClick={() => deleteAdj.mutate(adj.id)} data-testid={`button-delete-adj-${adj.id}`}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <div className="text-sm text-right font-medium pt-2">
                Adjustments Total: {formatCurrency(adjustmentTotal)}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-2">
        <CardContent className="py-4 space-y-3">
          <h3 className="font-semibold text-sm">Grand Total Breakdown</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Materials</p>
              <p className="font-medium">{formatCurrency(totalMaterial)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Fabrication</p>
              <p className="font-medium">{formatCurrency(totalFab)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Recap</p>
              <p className="font-medium">{formatCurrency(totalRecap)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tax</p>
              <p className="font-medium">{formatCurrency(totalTax)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Adjustments</p>
              <p className="font-medium">{formatCurrency(adjustmentTotal)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Grand Total</p>
              <p className="font-bold text-lg text-primary" data-testid="text-grand-total">{formatCurrency(grandTotal)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {(deductItems.length > 0 || addItems.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Quote Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="font-medium">Base Bid</span>
              <span className="font-bold">{formatCurrency(baseBid)}</span>
            </div>
            {deductItems.map((s) => (
              <div key={s.item.id} className="flex justify-between text-muted-foreground">
                <span>Deduct: {s.item.name}</span>
                <span>({formatCurrency(s.total)})</span>
              </div>
            ))}
            {addItems.map((s) => (
              <div key={s.item.id} className="flex justify-between text-muted-foreground">
                <span>Add: {s.item.name}</span>
                <span>{formatCurrency(s.total)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
