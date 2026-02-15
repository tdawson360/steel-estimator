import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Printer } from "lucide-react";
import {
  calcItemTotal, calcItemMaterialCost, calcItemFabCost,
  calcRecapTotal, calcTax, formatCurrency
} from "@/lib/calculations";
import { TAX_CATEGORIES, DELIVERY_OPTIONS } from "@shared/schema";
import type { Project, EstimateItem, Material, RecapCost, SummaryAdjustment } from "@shared/schema";

interface Props {
  project: Project;
  items: EstimateItem[];
  allMaterials: Record<number, Material[]>;
  recapCosts: Record<number, RecapCost>;
  adjustments: SummaryAdjustment[];
}

export default function QuoteTab({ project, items, allMaterials, recapCosts, adjustments }: Props) {
  const taxCat = TAX_CATEGORIES[(project.taxCategory || "new_construction") as keyof typeof TAX_CATEGORIES];
  const hasTax = taxCat && taxCat.rate > 0;

  const itemSummaries = useMemo(() => items.map((item) => {
    const mats = allMaterials[item.id] || [];
    const recap = recapCosts[item.id] || {} as RecapCost;
    const matCost = calcItemMaterialCost(mats);
    const fabCost = calcItemFabCost(mats, item);
    const estimateTotal = calcItemTotal(mats, item);
    const recapTotal = calcRecapTotal(recap);
    const tax = calcTax(project.taxCategory || "new_construction", matCost, fabCost);
    return { item, total: estimateTotal + recapTotal + tax };
  }), [items, allMaterials, recapCosts, project.taxCategory]);

  const baseItems = itemSummaries.filter((s) => (s.item.breakoutGroup || "base") === "base");
  const deductItems = itemSummaries.filter((s) => s.item.breakoutGroup === "deduct");
  const addItems = itemSummaries.filter((s) => s.item.breakoutGroup === "add");

  const adjustmentTotal = adjustments.reduce((s, a) => s + (a.amount || 0), 0);
  const baseBid = baseItems.reduce((s, i) => s + i.total, 0) + adjustmentTotal;

  const deliveryLabel = DELIVERY_OPTIONS.find(
    (d) => d.toLowerCase().replace(/\s+/g, "_") === project.deliveryOption
  ) || "Installed";

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between gap-3 flex-wrap print:hidden">
        <h2 className="text-lg font-semibold">Quotation</h2>
        <Button onClick={handlePrint} data-testid="button-print-quote">
          <Printer className="w-4 h-4 mr-2" />
          Print Quote
        </Button>
      </div>

      <Card className="max-w-[816px] mx-auto print:border-0 print:shadow-none">
        <CardContent className="p-8 print:p-0 space-y-6 text-sm" data-testid="quote-content">
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">BERGER IRON WORKS</h1>
            <p className="text-muted-foreground text-xs">Steel Fabrication & Erection</p>
          </div>

          <div className="text-center">
            <h2 className="text-lg font-semibold tracking-wide uppercase">Quotation</h2>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <h3 className="font-semibold text-xs uppercase text-muted-foreground tracking-wider">To</h3>
              {project.customerCompany && <p className="font-medium">{project.customerCompany}</p>}
              {project.customerContact && <p>{project.customerContact}</p>}
              {project.customerAddress && <p>{project.customerAddress}</p>}
              {project.customerPhone && <p>{project.customerPhone}</p>}
              {project.customerEmail && <p>{project.customerEmail}</p>}
            </div>
            <div className="space-y-2 text-right">
              <h3 className="font-semibold text-xs uppercase text-muted-foreground tracking-wider">Project</h3>
              <p className="font-medium">{project.projectName}</p>
              {project.projectAddress && <p>{project.projectAddress}</p>}
              {project.estimateDate && <p>Date: {project.estimateDate}</p>}
              {project.architect && <p>Architect: {project.architect}</p>}
              {project.drawingDate && (
                <p>Drawings: {project.drawingDate}{project.drawingRevision && ` (${project.drawingRevision})`}</p>
              )}
            </div>
          </div>

          <Separator />

          <div>
            <p className="mb-3">
              We are pleased to submit the following proposal for furnishing and{" "}
              {deliveryLabel === "Installed" ? "installing" : "delivering"} structural steel per
              plans and specifications as referenced above:
            </p>

            <div className="space-y-2">
              {baseItems.map((s, i) => (
                <div key={s.item.id} className="flex justify-between items-start gap-4">
                  <div>
                    <span className="font-medium">{s.item.name}</span>
                    {s.item.drawingRef && (
                      <span className="text-muted-foreground ml-2">({s.item.drawingRef})</span>
                    )}
                    {s.item.description && (
                      <p className="text-muted-foreground text-xs mt-0.5">{s.item.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="text-center space-y-2 py-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {deliveryLabel}
            </p>
            <div className="inline-block">
              <p
                className="text-2xl font-bold border-b-2 border-foreground pb-1 px-4"
                data-testid="text-quote-price"
              >
                {formatCurrency(baseBid)}
              </p>
            </div>
            {hasTax && (
              <p className="text-xs font-semibold uppercase tracking-wider">
                TAX INCLUDED
              </p>
            )}
          </div>

          {deductItems.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-semibold text-xs uppercase text-muted-foreground tracking-wider">Deduct Alternates</h4>
              {deductItems.map((s) => (
                <div key={s.item.id} className="flex justify-between">
                  <span>Deduct: {s.item.name}</span>
                  <span className="font-medium">({formatCurrency(s.total)})</span>
                </div>
              ))}
            </div>
          )}

          {addItems.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-semibold text-xs uppercase text-muted-foreground tracking-wider">Add Alternates</h4>
              {addItems.map((s) => (
                <div key={s.item.id} className="flex justify-between">
                  <span>Add: {s.item.name}</span>
                  <span className="font-medium">{formatCurrency(s.total)}</span>
                </div>
              ))}
            </div>
          )}

          {(project.qualifications || []).length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="font-semibold text-xs uppercase text-muted-foreground tracking-wider mb-2">Qualifications</h4>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  {(project.qualifications || []).map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {(project.exclusions || []).length > 0 && (
            <div>
              <h4 className="font-semibold text-xs uppercase text-muted-foreground tracking-wider mb-2">Exclusions</h4>
              <ul className="list-disc list-inside space-y-1 text-xs">
                {(project.exclusions || []).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          {!hasTax && (
            <>
              <Separator />
              <p className="text-xs text-muted-foreground">
                Sales tax is not included in the above pricing. Applicable sales tax will be added at the time of invoicing
                unless a valid resale certificate or tax-exempt documentation is provided.
              </p>
            </>
          )}

          <Separator />

          <div className="space-y-4 pt-4">
            <p className="text-xs text-muted-foreground">
              This proposal is valid for thirty (30) days from the date of this quotation. Acceptance of this proposal
              indicates agreement to the terms and conditions stated above.
            </p>

            <div className="grid grid-cols-2 gap-8 pt-6">
              <div className="space-y-2">
                <p className="font-semibold text-xs">BERGER IRON WORKS</p>
                <div className="border-b pt-8" />
                <p className="text-xs text-muted-foreground">Authorized Signature</p>
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-xs">ACCEPTED BY</p>
                <div className="border-b pt-8" />
                <p className="text-xs text-muted-foreground">Signature / Date</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
