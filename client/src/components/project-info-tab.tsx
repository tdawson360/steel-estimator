import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Plus, X, Building2, User, MapPin, Phone, Mail, FileText, Ruler, Truck, Receipt } from "lucide-react";
import { useUpdateProject } from "@/lib/hooks";
import {
  TAX_CATEGORIES, PROJECT_TYPES, DELIVERY_OPTIONS,
  STANDARD_EXCLUSIONS, STANDARD_QUALIFICATIONS
} from "@shared/schema";
import type { Project } from "@shared/schema";

interface Props {
  project: Project;
}

export default function ProjectInfoTab({ project }: Props) {
  const update = useUpdateProject(project.id);
  const [form, setForm] = useState({ ...project });
  const [customExclusion, setCustomExclusion] = useState("");
  const [customQualification, setCustomQualification] = useState("");

  useEffect(() => {
    setForm({ ...project });
  }, [project]);

  const save = useCallback(
    (partial: Partial<Project>) => {
      const next = { ...form, ...partial };
      setForm(next);
      update.mutate(partial);
    },
    [form, update],
  );

  const toggleExclusion = (text: string) => {
    const current = form.exclusions || [];
    const next = current.includes(text) ? current.filter((e) => e !== text) : [...current, text];
    save({ exclusions: next });
  };

  const addCustomExclusion = () => {
    if (!customExclusion.trim()) return;
    const next = [...(form.exclusions || []), customExclusion.trim()];
    save({ exclusions: next });
    setCustomExclusion("");
  };

  const toggleQualification = (text: string) => {
    const current = form.qualifications || [];
    const next = current.includes(text) ? current.filter((q) => q !== text) : [...current, text];
    save({ qualifications: next });
  };

  const addCustomQualification = () => {
    if (!customQualification.trim()) return;
    const next = [...(form.qualifications || []), customQualification.trim()];
    save({ qualifications: next });
    setCustomQualification("");
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              Customer Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="customerCompany">Company</Label>
              <Input
                id="customerCompany"
                value={form.customerCompany || ""}
                onChange={(e) => save({ customerCompany: e.target.value })}
                placeholder="Company name"
                data-testid="input-customer-company"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customerContact">Contact</Label>
              <Input
                id="customerContact"
                value={form.customerContact || ""}
                onChange={(e) => save({ customerContact: e.target.value })}
                placeholder="Contact name"
                data-testid="input-customer-contact"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customerAddress">Billing Address</Label>
              <Input
                id="customerAddress"
                value={form.customerAddress || ""}
                onChange={(e) => save({ customerAddress: e.target.value })}
                placeholder="Address"
                data-testid="input-customer-address"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="customerPhone">Phone</Label>
                <Input
                  id="customerPhone"
                  value={form.customerPhone || ""}
                  onChange={(e) => save({ customerPhone: e.target.value })}
                  placeholder="(555) 555-5555"
                  data-testid="input-customer-phone"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="customerEmail">Email</Label>
                <Input
                  id="customerEmail"
                  value={form.customerEmail || ""}
                  onChange={(e) => save({ customerEmail: e.target.value })}
                  placeholder="email@example.com"
                  data-testid="input-customer-email"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              Project Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="projectName">Project Name</Label>
              <Input
                id="projectName"
                value={form.projectName || ""}
                onChange={(e) => save({ projectName: e.target.value })}
                placeholder="Project name"
                data-testid="input-project-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="projectAddress">Project Address</Label>
              <Input
                id="projectAddress"
                value={form.projectAddress || ""}
                onChange={(e) => save({ projectAddress: e.target.value })}
                placeholder="Job site address"
                data-testid="input-project-address"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="drawingDate">Drawing Date</Label>
                <Input
                  id="drawingDate"
                  value={form.drawingDate || ""}
                  onChange={(e) => save({ drawingDate: e.target.value })}
                  placeholder="MM/DD/YYYY"
                  data-testid="input-drawing-date"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="drawingRevision">Revision</Label>
                <Input
                  id="drawingRevision"
                  value={form.drawingRevision || ""}
                  onChange={(e) => save({ drawingRevision: e.target.value })}
                  placeholder="Rev A"
                  data-testid="input-drawing-revision"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="architect">Architect</Label>
              <Input
                id="architect"
                value={form.architect || ""}
                onChange={(e) => save({ architect: e.target.value })}
                placeholder="Architect name"
                data-testid="input-architect"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="estimateDate">Estimate Date</Label>
                <Input
                  id="estimateDate"
                  value={form.estimateDate || ""}
                  onChange={(e) => save({ estimateDate: e.target.value })}
                  placeholder="MM/DD/YYYY"
                  data-testid="input-estimate-date"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="estimatedBy">Estimated By</Label>
                <Input
                  id="estimatedBy"
                  value={form.estimatedBy || ""}
                  onChange={(e) => save({ estimatedBy: e.target.value })}
                  placeholder="Estimator name"
                  data-testid="input-estimated-by"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Ruler className="w-4 h-4 text-muted-foreground" />
              Project Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={form.projectType || "structural"}
              onValueChange={(v) => save({ projectType: v })}
            >
              <SelectTrigger data-testid="select-project-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_TYPES.map((t) => (
                  <SelectItem key={t} value={t.toLowerCase()} data-testid={`option-type-${t.toLowerCase()}`}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Truck className="w-4 h-4 text-muted-foreground" />
              Delivery
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={form.deliveryOption || "installed"}
              onValueChange={(v) => save({ deliveryOption: v })}
            >
              <SelectTrigger data-testid="select-delivery">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DELIVERY_OPTIONS.map((d) => (
                  <SelectItem key={d} value={d.toLowerCase().replace(/\s+/g, "_")} data-testid={`option-delivery-${d.toLowerCase()}`}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="w-4 h-4 text-muted-foreground" />
              Tax Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={form.taxCategory || "new_construction"}
              onValueChange={(v) => save({ taxCategory: v })}
            >
              <SelectTrigger data-testid="select-tax-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TAX_CATEGORIES).map(([key, cat]) => (
                  <SelectItem key={key} value={key} data-testid={`option-tax-${key}`}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">
              {TAX_CATEGORIES[(form.taxCategory || "new_construction") as keyof typeof TAX_CATEGORIES]?.description}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Exclusions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {STANDARD_EXCLUSIONS.map((excl) => (
              <label key={excl} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={(form.exclusions || []).includes(excl)}
                  onCheckedChange={() => toggleExclusion(excl)}
                  data-testid={`checkbox-exclusion-${excl.slice(0, 20).replace(/\s/g, "-")}`}
                />
                {excl}
              </label>
            ))}
          </div>
          {(form.exclusions || [])
            .filter((e) => !STANDARD_EXCLUSIONS.includes(e))
            .map((e) => (
              <div key={e} className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">Custom</Badge>
                <span className="text-sm flex-1">{e}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => toggleExclusion(e)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ))}
          <Separator />
          <div className="flex gap-2">
            <Input
              value={customExclusion}
              onChange={(e) => setCustomExclusion(e.target.value)}
              placeholder="Add custom exclusion..."
              onKeyDown={(e) => e.key === "Enter" && addCustomExclusion()}
              className="flex-1"
              data-testid="input-custom-exclusion"
            />
            <Button variant="outline" onClick={addCustomExclusion} data-testid="button-add-exclusion">
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Qualifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {STANDARD_QUALIFICATIONS.map((qual) => (
              <label key={qual} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={(form.qualifications || []).includes(qual)}
                  onCheckedChange={() => toggleQualification(qual)}
                  data-testid={`checkbox-qualification-${qual.slice(0, 20).replace(/\s/g, "-")}`}
                />
                {qual}
              </label>
            ))}
          </div>
          {(form.qualifications || [])
            .filter((q) => !STANDARD_QUALIFICATIONS.includes(q))
            .map((q) => (
              <div key={q} className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">Custom</Badge>
                <span className="text-sm flex-1">{q}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => toggleQualification(q)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ))}
          <Separator />
          <div className="flex gap-2">
            <Input
              value={customQualification}
              onChange={(e) => setCustomQualification(e.target.value)}
              placeholder="Add custom qualification..."
              onKeyDown={(e) => e.key === "Enter" && addCustomQualification()}
              className="flex-1"
              data-testid="input-custom-qualification"
            />
            <Button variant="outline" onClick={addCustomQualification} data-testid="button-add-qualification">
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
