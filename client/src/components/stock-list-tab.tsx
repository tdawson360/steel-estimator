import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package, Weight } from "lucide-react";
import { calcStockPieces, calcStockWeight, formatNumber, formatWeight } from "@/lib/calculations";
import type { EstimateItem, Material } from "@shared/schema";

interface Props {
  items: EstimateItem[];
  allMaterials: Record<number, Material[]>;
}

interface StockEntry {
  shape: string;
  shapeCategory: string;
  stockLength: number;
  quantity: number;
  totalWeight: number;
  weightPerFoot: number;
}

export default function StockListTab({ items, allMaterials }: Props) {
  const stockList = useMemo(() => {
    const map = new Map<string, StockEntry>();

    for (const item of items) {
      const materials = allMaterials[item.id] || [];
      for (const mat of materials) {
        const key = `${mat.shape}_${mat.stockLength}`;
        const pieces = calcStockPieces(mat);
        const existing = map.get(key);
        if (existing) {
          existing.quantity += pieces;
          existing.totalWeight += calcStockWeight(mat);
        } else {
          map.set(key, {
            shape: mat.shape,
            shapeCategory: mat.shapeCategory,
            stockLength: mat.stockLength || 20,
            quantity: pieces,
            totalWeight: calcStockWeight(mat),
            weightPerFoot: mat.weightPerFoot || 0,
          });
        }
      }
    }

    const entries = Array.from(map.values());
    entries.sort((a, b) => a.shapeCategory.localeCompare(b.shapeCategory) || a.shape.localeCompare(b.shape));
    return entries;
  }, [items, allMaterials]);

  const totalPieces = stockList.reduce((s, e) => s + e.quantity, 0);
  const totalWeight = stockList.reduce((s, e) => s + e.totalWeight, 0);
  const categories = [...new Set(stockList.map((e) => e.shapeCategory))];

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-semibold">Consolidated Stock List</h2>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{totalPieces} pieces</span>
          <span>{formatWeight(totalWeight)}</span>
        </div>
      </div>

      {stockList.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Package className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No materials in the estimate yet. Add items and materials to generate the stock list.</p>
          </CardContent>
        </Card>
      ) : (
        categories.map((cat) => {
          const catEntries = stockList.filter((e) => e.shapeCategory === cat);
          const catWeight = catEntries.reduce((s, e) => s + e.totalWeight, 0);
          const catPieces = catEntries.reduce((s, e) => s + e.quantity, 0);
          return (
            <Card key={cat}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2">
                    {cat}
                    <Badge variant="secondary" className="text-xs">{catEntries.length} shapes</Badge>
                  </CardTitle>
                  <span className="text-sm text-muted-foreground">
                    {catPieces} pcs / {formatWeight(catWeight)}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Shape</TableHead>
                      <TableHead className="text-right">Wt/ft</TableHead>
                      <TableHead className="text-right">Stock Length</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Total Weight</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {catEntries.map((entry, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium" data-testid={`text-stock-shape-${entry.shape}`}>{entry.shape}</TableCell>
                        <TableCell className="text-right">{formatNumber(entry.weightPerFoot, 1)}#</TableCell>
                        <TableCell className="text-right">{formatNumber(entry.stockLength, 0)}'</TableCell>
                        <TableCell className="text-right">{entry.quantity}</TableCell>
                        <TableCell className="text-right font-medium">{formatWeight(entry.totalWeight)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
