import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Calculator } from "lucide-react";
import { useUpdateRecap } from "@/lib/hooks";
import { calcItemTotal, calcRecapTotal, calcTax, calcItemMaterialCost, calcItemFabCost, formatCurrency } from "@/lib/calculations";
import { TAX_CATEGORIES } from "@shared/schema";
import type { Project, EstimateItem, Material, RecapCost, CustomCost } from "@shared/schema";

interface Props {
  project: Project;
  items: EstimateItem[];
  allMaterials: Record<number, Material[]>;
  recapCosts: Record<number, RecapCost>;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

export default function RecapTab({ project, items, allMaterials, recapCosts }: Props) {
  const updateRecap = useUpdateRecap(project.id);

  const handleChange = (itemId: number, field: string, value: number) => {
    const current = recapCosts[itemId] || {};
    updateRecap.mutate({ itemId, ...current, [field]: value });
  };

  const addCustomCost = (itemId: number) => {
    const current = recapCosts[itemId] || {};
    const customs = [...(current.customCosts || []), {
      id: generateId(), name: "Custom", hours: 0, rate: 0, amount: 0, markupPercent: 0,
    }];
    updateRecap.mutate({ itemId, ...current, customCosts: customs });
  };

  const updateCustomCost = (itemId: number, costId: string, field: string, value: string | number) => {
    const current = recapCosts[itemId] || {};
    const customs = (current.customCosts || []).map((c) => {
      if (c.id !== costId) return c;
      const updated = { ...c, [field]: value };
      if (field === "hours" || field === "rate") {
        updated.amount = updated.hours * updated.rate;
      }
      return updated;
    });
    updateRecap.mutate({ itemId, ...current, customCosts: customs });
  };

  const removeCustomCost = (itemId: number, costId: string) => {
    const current = recapCosts[itemId] || {};
    const customs = (current.customCosts || []).filter((c) => c.id !== costId);
    updateRecap.mutate({ itemId, ...current, customCosts: customs });
  };

  const taxCat = TAX_CATEGORIES[(project.taxCategory || "new_construction") as keyof typeof TAX_CATEGORIES];

  let grandTotal = 0;
  let totalInstallation = 0;
  let totalDrafting = 0;
  let totalEngineering = 0;
  let totalPM = 0;
  let totalShipping = 0;
  let totalTax = 0;
  let totalRecap = 0;

  items.forEach((item) => {
    const recap = recapCosts[item.id] || {} as RecapCost;
    const mats = allMaterials[item.id] || [];
    const install = (recap.installationHours || 0) * (recap.installationRate || 0);
    const draft = (recap.draftingHours || 0) * (recap.draftingRate || 0);
    const eng = (recap.engineeringHours || 0) * (recap.engineeringRate || 0);
    const pm = (recap.projectMgmtHours || 0) * (recap.projectMgmtRate || 0);
    const ship = recap.shippingCost || 0;
    const matCost = calcItemMaterialCost(mats);
    const fabCost = calcItemFabCost(mats, item);
    const tax = calcTax(project.taxCategory || "new_construction", matCost, fabCost);

    totalInstallation += install;
    totalDrafting += draft;
    totalEngineering += eng;
    totalPM += pm;
    totalShipping += ship;
    totalTax += tax;
    totalRecap += calcRecapTotal(recap);
    grandTotal += calcRecapTotal(recap) + tax;
  });

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Calculator className="w-5 h-5" />
          Recap
        </h2>
        <span className="text-sm text-muted-foreground">
          Tax: {taxCat?.label} &mdash; {taxCat?.description}
        </span>
      </div>

      {items.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <p className="text-muted-foreground">Add estimate items first to configure recap costs.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const recap = recapCosts[item.id] || {} as RecapCost;
            const mats = allMaterials[item.id] || [];
            const matCost = calcItemMaterialCost(mats);
            const fabCost = calcItemFabCost(mats, item);
            const tax = calcTax(project.taxCategory || "new_construction", matCost, fabCost);
            const recapTotal = calcRecapTotal(recap);

            return (
              <Card key={item.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between gap-2 flex-wrap">
                    <span>{item.name}</span>
                    <span className="text-muted-foreground font-normal text-xs">
                      Estimate: {formatCurrency(calcItemTotal(mats, item))}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <RecapField
                      label="Installation"
                      hoursValue={recap.installationHours || 0}
                      rateValue={recap.installationRate || 0}
                      onHoursChange={(v) => handleChange(item.id, "installationHours", v)}
                      onRateChange={(v) => handleChange(item.id, "installationRate", v)}
                      testIdPrefix={`recap-install-${item.id}`}
                    />
                    <RecapField
                      label="Drafting"
                      hoursValue={recap.draftingHours || 0}
                      rateValue={recap.draftingRate || 0}
                      onHoursChange={(v) => handleChange(item.id, "draftingHours", v)}
                      onRateChange={(v) => handleChange(item.id, "draftingRate", v)}
                      testIdPrefix={`recap-drafting-${item.id}`}
                    />
                    <RecapField
                      label="Engineering"
                      hoursValue={recap.engineeringHours || 0}
                      rateValue={recap.engineeringRate || 0}
                      onHoursChange={(v) => handleChange(item.id, "engineeringHours", v)}
                      onRateChange={(v) => handleChange(item.id, "engineeringRate", v)}
                      testIdPrefix={`recap-eng-${item.id}`}
                    />
                    <RecapField
                      label="Project Mgmt"
                      hoursValue={recap.projectMgmtHours || 0}
                      rateValue={recap.projectMgmtRate || 0}
                      onHoursChange={(v) => handleChange(item.id, "projectMgmtHours", v)}
                      onRateChange={(v) => handleChange(item.id, "projectMgmtRate", v)}
                      testIdPrefix={`recap-pm-${item.id}`}
                    />
                    <div className="space-y-1">
                      <Label className="text-xs">Shipping</Label>
                      <Input
                        type="number"
                        value={recap.shippingCost || ""}
                        onChange={(e) => handleChange(item.id, "shippingCost", parseFloat(e.target.value) || 0)}
                        className="h-8 text-xs"
                        placeholder="$0.00"
                        data-testid={`input-recap-shipping-${item.id}`}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Markup %</Label>
                      <Input
                        type="number"
                        value={recap.markupPercent || ""}
                        onChange={(e) => handleChange(item.id, "markupPercent", parseFloat(e.target.value) || 0)}
                        className="h-8 w-20 text-xs"
                        data-testid={`input-recap-markup-${item.id}`}
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs mt-auto"
                      onClick={() => addCustomCost(item.id)}
                      data-testid={`button-add-custom-cost-${item.id}`}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Custom Column
                    </Button>
                  </div>

                  {(recap.customCosts || []).length > 0 && (
                    <div className="space-y-2">
                      {(recap.customCosts || []).map((cc) => (
                        <div key={cc.id} className="grid grid-cols-[1fr_80px_80px_80px_32px] gap-2 items-center">
                          <Input
                            value={cc.name}
                            onChange={(e) => updateCustomCost(item.id, cc.id, "name", e.target.value)}
                            className="h-7 text-xs"
                            placeholder="Cost name"
                          />
                          <Input
                            type="number"
                            value={cc.hours || ""}
                            onChange={(e) => updateCustomCost(item.id, cc.id, "hours", parseFloat(e.target.value) || 0)}
                            className="h-7 text-xs"
                            placeholder="Hrs"
                          />
                          <Input
                            type="number"
                            value={cc.rate || ""}
                            onChange={(e) => updateCustomCost(item.id, cc.id, "rate", parseFloat(e.target.value) || 0)}
                            className="h-7 text-xs"
                            placeholder="Rate"
                          />
                          <span className="text-xs text-right">{formatCurrency(cc.hours * cc.rate)}</span>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeCustomCost(item.id, cc.id)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-sm pt-2 border-t gap-3 flex-wrap">
                    <span className="text-muted-foreground">
                      Tax ({taxCat?.label}): {formatCurrency(tax)}
                    </span>
                    <span className="font-medium">
                      Recap Total: {formatCurrency(recapTotal + tax)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          <Card className="bg-card border-2">
            <CardContent className="py-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-4 text-center text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Installation</p>
                  <p className="font-medium">{formatCurrency(totalInstallation)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Drafting</p>
                  <p className="font-medium">{formatCurrency(totalDrafting)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Engineering</p>
                  <p className="font-medium">{formatCurrency(totalEngineering)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Project Mgmt</p>
                  <p className="font-medium">{formatCurrency(totalPM)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Shipping</p>
                  <p className="font-medium">{formatCurrency(totalShipping)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tax</p>
                  <p className="font-medium">{formatCurrency(totalTax)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Recap Total</p>
                  <p className="font-bold text-primary">{formatCurrency(grandTotal)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function RecapField({
  label, hoursValue, rateValue, onHoursChange, onRateChange, testIdPrefix,
}: {
  label: string;
  hoursValue: number;
  rateValue: number;
  onHoursChange: (v: number) => void;
  onRateChange: (v: number) => void;
  testIdPrefix: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-1">
        <Input
          type="number"
          value={hoursValue || ""}
          onChange={(e) => onHoursChange(parseFloat(e.target.value) || 0)}
          className="h-8 text-xs flex-1"
          placeholder="Hrs"
          data-testid={`input-${testIdPrefix}-hours`}
        />
        <Input
          type="number"
          value={rateValue || ""}
          onChange={(e) => onRateChange(parseFloat(e.target.value) || 0)}
          className="h-8 text-xs flex-1"
          placeholder="Rate"
          data-testid={`input-${testIdPrefix}-rate`}
        />
      </div>
      <p className="text-xs text-muted-foreground text-right">
        {formatCurrency(hoursValue * rateValue)}
      </p>
    </div>
  );
}
