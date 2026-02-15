import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Plus, Trash2, ChevronDown, ChevronRight, Package, Wrench,
  Weight, DollarSign, Percent, GripVertical
} from "lucide-react";
import {
  useCreateItem, useUpdateItem, useDeleteItem,
  useCreateMaterial, useUpdateMaterial, useDeleteMaterial
} from "@/lib/hooks";
import {
  calcMaterialWeight, calcStockWeight, calcStockPieces, calcWastePercent,
  calcItemMaterialCost, calcItemFabCost, calcItemMaterialMarkup, calcItemFabMarkup,
  calcItemTotal, calcItemFabWeight, calcItemStockWeight, calcFabCost,
  formatCurrency, formatNumber, formatWeight
} from "@/lib/calculations";
import { STEEL_SHAPES, FAB_CATEGORIES, BREAKOUT_GROUPS } from "@shared/schema";
import type { Project, EstimateItem, Material, FabOperation } from "@shared/schema";

interface Props {
  project: Project;
  items: EstimateItem[];
  allMaterials: Record<number, Material[]>;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

export default function EstimateTab({ project, items, allMaterials }: Props) {
  const [openItems, setOpenItems] = useState<Set<number>>(new Set());
  const [shapeFilter, setShapeFilter] = useState("");
  const createItem = useCreateItem(project.id);
  const updateItem = useUpdateItem(project.id);
  const deleteItem = useDeleteItem(project.id);

  const toggleItem = (id: number) => {
    const next = new Set(openItems);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpenItems(next);
  };

  const handleAddItem = async () => {
    const result = await createItem.mutateAsync({
      projectId: project.id,
      name: `Item ${items.length + 1}`,
      sortOrder: items.length,
    });
    setOpenItems(new Set([...openItems, result.id]));
  };

  const totalFabWeight = items.reduce((sum, item) => sum + calcItemFabWeight(allMaterials[item.id] || []), 0);
  const totalStockWeight = items.reduce((sum, item) => sum + calcItemStockWeight(allMaterials[item.id] || []), 0);
  const totalMaterial = items.reduce((sum, item) => sum + calcItemMaterialCost(allMaterials[item.id] || []), 0);
  const totalMarkup = items.reduce((sum, item) => {
    const mats = allMaterials[item.id] || [];
    return sum + calcItemMaterialMarkup(mats, item) + calcItemFabMarkup(mats, item);
  }, 0);
  const totalFab = items.reduce((sum, item) => sum + calcItemFabCost(allMaterials[item.id] || [], item), 0);
  const grandTotal = items.reduce((sum, item) => sum + calcItemTotal(allMaterials[item.id] || [], item), 0);

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-semibold">Estimate Items</h2>
        <Button onClick={handleAddItem} disabled={createItem.isPending} data-testid="button-add-item">
          <Plus className="w-4 h-4 mr-2" />
          Add Item
        </Button>
      </div>

      {items.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Package className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No items yet. Add your first estimate item.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              project={project}
              materials={allMaterials[item.id] || []}
              isOpen={openItems.has(item.id)}
              onToggle={() => toggleItem(item.id)}
            />
          ))}
        </div>
      )}

      <Card className="bg-card border-2">
        <CardContent className="py-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Fab Weight</p>
              <p className="font-semibold text-sm" data-testid="text-total-fab-weight">{formatWeight(totalFabWeight)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Stock Weight</p>
              <p className="font-semibold text-sm" data-testid="text-total-stock-weight">{formatWeight(totalStockWeight)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Material</p>
              <p className="font-semibold text-sm" data-testid="text-total-material">{formatCurrency(totalMaterial)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Markup</p>
              <p className="font-semibold text-sm" data-testid="text-total-markup">{formatCurrency(totalMarkup)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Fabrication</p>
              <p className="font-semibold text-sm" data-testid="text-total-fab">{formatCurrency(totalFab)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Grand Total</p>
              <p className="font-bold text-sm text-primary" data-testid="text-grand-total">{formatCurrency(grandTotal)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ItemCard({
  item, project, materials, isOpen, onToggle,
}: {
  item: EstimateItem;
  project: Project;
  materials: Material[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  const updateItem = useUpdateItem(project.id);
  const deleteItemMut = useDeleteItem(project.id);
  const createMaterial = useCreateMaterial(project.id, item.id);
  const updateMaterial = useUpdateMaterial(project.id, item.id);
  const deleteMaterial = useDeleteMaterial(project.id, item.id);

  const matCost = calcItemMaterialCost(materials);
  const fabCost = calcItemFabCost(materials, item);
  const total = calcItemTotal(materials, item);

  const handleAddMaterial = async () => {
    await createMaterial.mutateAsync({
      itemId: item.id,
      shapeCategory: "W",
      shape: "W8x10",
      weightPerFoot: 10,
      length: 10,
      quantity: 1,
      unitPrice: 0,
      stockLength: 20,
      sortOrder: materials.length,
    });
  };

  const addFabOp = (category: string, name: string, targetType: "item" | "material", materialId?: number) => {
    const op: FabOperation = { id: generateId(), category, name, hours: 0, rate: 0, cost: 0 };
    if (targetType === "item") {
      const ops = [...(item.generalFabOps || []), op];
      updateItem.mutate({ id: item.id, generalFabOps: ops });
    } else if (materialId !== undefined) {
      const mat = materials.find((m) => m.id === materialId);
      if (mat) {
        const ops = [...(mat.fabOps || []), op];
        updateMaterial.mutate({ id: materialId, fabOps: ops });
      }
    }
  };

  const updateFabOp = (ops: FabOperation[], opId: string, field: keyof FabOperation, value: number) => {
    return ops.map((o) => {
      if (o.id !== opId) return o;
      const updated = { ...o, [field]: value };
      updated.cost = updated.hours * updated.rate;
      return updated;
    });
  };

  const removeFabOp = (ops: FabOperation[], opId: string) => {
    return ops.filter((o) => o.id !== opId);
  };

  const shapeCategories = [...new Set(STEEL_SHAPES.map((s) => s.category))];

  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover-elevate flex flex-row items-center gap-3 py-3">
            {isOpen ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm truncate" data-testid={`text-item-name-${item.id}`}>{item.name}</span>
                <Badge variant="outline" className="text-xs">{item.breakoutGroup || "Base"}</Badge>
                {item.description && (
                  <span className="text-xs text-muted-foreground truncate">{item.description}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
              <span>{formatWeight(calcItemFabWeight(materials))}</span>
              <span className="font-medium text-foreground">{formatCurrency(total)}</span>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Item Name</Label>
                <Input
                  value={item.name}
                  onChange={(e) => updateItem.mutate({ id: item.id, name: e.target.value })}
                  data-testid={`input-item-name-${item.id}`}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Description</Label>
                <Input
                  value={item.description || ""}
                  onChange={(e) => updateItem.mutate({ id: item.id, description: e.target.value })}
                  placeholder="Description"
                  data-testid={`input-item-desc-${item.id}`}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Drawing Ref</Label>
                <Input
                  value={item.drawingRef || ""}
                  onChange={(e) => updateItem.mutate({ id: item.id, drawingRef: e.target.value })}
                  placeholder="S-101"
                  data-testid={`input-item-drawing-${item.id}`}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Breakout Group</Label>
                <Select
                  value={item.breakoutGroup || "base"}
                  onValueChange={(v) => updateItem.mutate({ id: item.id, breakoutGroup: v })}
                >
                  <SelectTrigger data-testid={`select-breakout-${item.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BREAKOUT_GROUPS.map((g) => (
                      <SelectItem key={g} value={g.toLowerCase()}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <h4 className="text-sm font-medium flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5" />
                  Materials
                </h4>
                <Button size="sm" variant="outline" onClick={handleAddMaterial} disabled={createMaterial.isPending} data-testid={`button-add-material-${item.id}`}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add Material
                </Button>
              </div>

              {materials.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No materials added yet</p>
              ) : (
                <div className="space-y-2">
                  {materials.filter((m) => !m.parentMaterialId).map((mat) => (
                    <MaterialRow
                      key={mat.id}
                      mat={mat}
                      item={item}
                      project={project}
                      shapeCategories={shapeCategories}
                      updateMaterial={updateMaterial}
                      deleteMaterial={deleteMaterial}
                      addFabOp={addFabOp}
                      updateFabOp={updateFabOp}
                      removeFabOp={removeFabOp}
                    />
                  ))}
                </div>
              )}
            </div>

            <Separator />

            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <h4 className="text-sm font-medium flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5" />
                  General Fabrication
                </h4>
                <FabOpSelector
                  onSelect={(cat, name) => addFabOp(cat, name, "item")}
                  testId={`button-add-gen-fab-${item.id}`}
                />
              </div>
              {(item.generalFabOps || []).length > 0 && (
                <div className="space-y-1">
                  {(item.generalFabOps || []).map((op) => (
                    <div key={op.id} className="grid grid-cols-[1fr_80px_80px_80px_32px] gap-2 items-center text-sm">
                      <span className="text-muted-foreground truncate">{op.name}</span>
                      <Input
                        type="number"
                        value={op.hours || ""}
                        onChange={(e) => {
                          const ops = updateFabOp(item.generalFabOps || [], op.id, "hours", parseFloat(e.target.value) || 0);
                          updateItem.mutate({ id: item.id, generalFabOps: ops });
                        }}
                        placeholder="Hrs"
                        className="h-8 text-xs"
                      />
                      <Input
                        type="number"
                        value={op.rate || ""}
                        onChange={(e) => {
                          const ops = updateFabOp(item.generalFabOps || [], op.id, "rate", parseFloat(e.target.value) || 0);
                          updateItem.mutate({ id: item.id, generalFabOps: ops });
                        }}
                        placeholder="Rate"
                        className="h-8 text-xs"
                      />
                      <span className="text-xs text-right">{formatCurrency(op.hours * op.rate)}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => {
                          const ops = removeFabOp(item.generalFabOps || [], op.id);
                          updateItem.mutate({ id: item.id, generalFabOps: ops });
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Material Cost</p>
                <p className="font-medium">{formatCurrency(matCost)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Material Markup</p>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={item.materialMarkupPercent || ""}
                    onChange={(e) => updateItem.mutate({ id: item.id, materialMarkupPercent: parseFloat(e.target.value) || 0 })}
                    className="h-7 w-16 text-xs"
                    data-testid={`input-mat-markup-${item.id}`}
                  />
                  <span className="text-xs">%</span>
                  <span className="text-xs ml-1">{formatCurrency(calcItemMaterialMarkup(materials, item))}</span>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Fab Cost</p>
                <p className="font-medium">{formatCurrency(fabCost)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Fab Markup</p>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={item.fabMarkupPercent || ""}
                    onChange={(e) => updateItem.mutate({ id: item.id, fabMarkupPercent: parseFloat(e.target.value) || 0 })}
                    className="h-7 w-16 text-xs"
                    data-testid={`input-fab-markup-${item.id}`}
                  />
                  <span className="text-xs">%</span>
                  <span className="text-xs ml-1">{formatCurrency(calcItemFabMarkup(materials, item))}</span>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Item Total</p>
                <p className="font-bold text-primary">{formatCurrency(total)}</p>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => deleteItemMut.mutate(item.id)}
                data-testid={`button-delete-item-${item.id}`}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Delete Item
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function MaterialRow({
  mat, item, project, shapeCategories, updateMaterial, deleteMaterial, addFabOp, updateFabOp, removeFabOp,
}: {
  mat: Material;
  item: EstimateItem;
  project: Project;
  shapeCategories: string[];
  updateMaterial: ReturnType<typeof useUpdateMaterial>;
  deleteMaterial: ReturnType<typeof useDeleteMaterial>;
  addFabOp: (cat: string, name: string, target: "item" | "material", materialId?: number) => void;
  updateFabOp: (ops: FabOperation[], opId: string, field: keyof FabOperation, value: number) => FabOperation[];
  removeFabOp: (ops: FabOperation[], opId: string) => FabOperation[];
}) {
  const [showFab, setShowFab] = useState(false);
  const shapesForCategory = STEEL_SHAPES.filter((s) => s.category === mat.shapeCategory);
  const fabWeight = calcMaterialWeight(mat);
  const stockWeight = calcStockWeight(mat);
  const waste = calcWastePercent(mat);

  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-7 gap-2 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Category</Label>
          <Select
            value={mat.shapeCategory}
            onValueChange={(v) => {
              const first = STEEL_SHAPES.find((s) => s.category === v);
              updateMaterial.mutate({
                id: mat.id,
                shapeCategory: v,
                shape: first?.name || "",
                weightPerFoot: first?.weightPerFoot || 0,
              });
            }}
          >
            <SelectTrigger className="h-8 text-xs" data-testid={`select-shape-cat-${mat.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {shapeCategories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Shape</Label>
          <Select
            value={mat.shape}
            onValueChange={(v) => {
              const found = STEEL_SHAPES.find((s) => s.name === v);
              updateMaterial.mutate({
                id: mat.id,
                shape: v,
                weightPerFoot: found?.weightPerFoot || mat.weightPerFoot,
              });
            }}
          >
            <SelectTrigger className="h-8 text-xs" data-testid={`select-shape-${mat.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {shapesForCategory.map((s) => (
                <SelectItem key={s.name} value={s.name}>
                  {s.name} ({s.weightPerFoot}#)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Length (ft)</Label>
          <Input
            type="number"
            value={mat.length || ""}
            onChange={(e) => updateMaterial.mutate({ id: mat.id, length: parseFloat(e.target.value) || 0 })}
            className="h-8 text-xs"
            data-testid={`input-length-${mat.id}`}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Qty</Label>
          <Input
            type="number"
            value={mat.quantity || ""}
            onChange={(e) => updateMaterial.mutate({ id: mat.id, quantity: parseInt(e.target.value) || 1 })}
            className="h-8 text-xs"
            data-testid={`input-qty-${mat.id}`}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">$/lb</Label>
          <Input
            type="number"
            value={mat.unitPrice || ""}
            onChange={(e) => updateMaterial.mutate({ id: mat.id, unitPrice: parseFloat(e.target.value) || 0 })}
            className="h-8 text-xs"
            step="0.01"
            data-testid={`input-price-${mat.id}`}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Stock Len</Label>
          <Input
            type="number"
            value={mat.stockLength || ""}
            onChange={(e) => updateMaterial.mutate({ id: mat.id, stockLength: parseFloat(e.target.value) || 20 })}
            className="h-8 text-xs"
            data-testid={`input-stock-len-${mat.id}`}
          />
        </div>
        <div className="flex items-end gap-1">
          <div className="flex items-center gap-1.5">
            <Switch
              checked={mat.galvanized || false}
              onCheckedChange={(v) => updateMaterial.mutate({ id: mat.id, galvanized: v })}
              data-testid={`switch-galv-${mat.id}`}
            />
            <Label className="text-xs">Galv</Label>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 ml-auto"
            onClick={() => deleteMaterial.mutate(mat.id)}
            data-testid={`button-delete-mat-${mat.id}`}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <span>Fab: {formatNumber(fabWeight, 0)} lbs</span>
        <span>Stock: {formatNumber(stockWeight, 0)} lbs ({calcStockPieces(mat)} pcs)</span>
        <span>Waste: {formatNumber(waste, 1)}%</span>
        <span>Eff: {formatNumber(100 - waste, 1)}%</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs ml-auto"
          onClick={() => setShowFab(!showFab)}
        >
          <Wrench className="w-3 h-3 mr-1" />
          Fab Ops ({(mat.fabOps || []).length})
        </Button>
      </div>

      {showFab && (
        <div className="pl-4 border-l-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Fabrication Operations</span>
            <FabOpSelector
              onSelect={(cat, name) => addFabOp(cat, name, "material", mat.id)}
              testId={`button-add-fab-${mat.id}`}
            />
          </div>
          {(mat.fabOps || []).map((op) => (
            <div key={op.id} className="grid grid-cols-[1fr_80px_80px_80px_32px] gap-2 items-center text-sm">
              <span className="text-xs text-muted-foreground truncate">{op.name}</span>
              <Input
                type="number"
                value={op.hours || ""}
                onChange={(e) => {
                  const ops = updateFabOp(mat.fabOps || [], op.id, "hours", parseFloat(e.target.value) || 0);
                  updateMaterial.mutate({ id: mat.id, fabOps: ops });
                }}
                placeholder="Hrs"
                className="h-7 text-xs"
              />
              <Input
                type="number"
                value={op.rate || ""}
                onChange={(e) => {
                  const ops = updateFabOp(mat.fabOps || [], op.id, "rate", parseFloat(e.target.value) || 0);
                  updateMaterial.mutate({ id: mat.id, fabOps: ops });
                }}
                placeholder="Rate"
                className="h-7 text-xs"
              />
              <span className="text-xs text-right">{formatCurrency(op.hours * op.rate)}</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => {
                  const ops = removeFabOp(mat.fabOps || [], op.id);
                  updateMaterial.mutate({ id: mat.id, fabOps: ops });
                }}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
          {(mat.fabOps || []).length > 0 && (
            <div className="text-xs text-right font-medium">
              Total: {formatCurrency(calcFabCost(mat.fabOps || []))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FabOpSelector({ onSelect, testId }: { onSelect: (category: string, name: string) => void; testId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button size="sm" variant="outline" onClick={() => setOpen(!open)} className="h-7 text-xs" data-testid={testId}>
        <Plus className="w-3 h-3 mr-1" />
        Add Fab Op
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-popover border rounded-md shadow-lg p-2 w-56 max-h-64 overflow-y-auto">
            {Object.entries(FAB_CATEGORIES).map(([cat, ops]) => (
              <div key={cat} className="mb-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 py-1">
                  {cat}
                </p>
                {ops.map((op) => (
                  <button
                    key={op}
                    className="w-full text-left text-sm px-2 py-1 rounded hover-elevate"
                    onClick={() => {
                      onSelect(cat, op);
                      setOpen(false);
                    }}
                  >
                    {op}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
