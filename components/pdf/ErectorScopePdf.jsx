import React from 'react';
import { Document, Page, View, Text, Image } from '@react-pdf/renderer';
import { styles, COLORS, CompanyHeader, PageFooter, SectionBar } from './PdfShared';
import { visibleFabOps, roundCustom } from './pdfUtils';

// ─── Price-Redacted Summary Page ────────────────────────────────────────────

const ErectorSummaryPage = ({
  logo,
  projectName,
  projectAddress,
  drawingRevision,
  drawingDate,
  estimateDate,
  estimatedBy,
  architect,
  projectTypes,
  deliveryOptions,
  customProjectTypes = [],
  selectedCustomDelivery = null,
  items,
  selectedExclusions,
  customExclusions,
  selectedQualifications,
  customQualifications,
}) => {
  const genDate = new Date().toLocaleDateString();
  const printDate = estimateDate ? new Date(estimateDate).toLocaleDateString() : genDate;
  const drawingDateFmt = drawingDate ? new Date(drawingDate).toLocaleDateString() : null;

  const projectTypesText = [
    projectTypes?.structural && 'structural',
    projectTypes?.miscellaneous && 'miscellaneous',
    projectTypes?.ornamental && 'ornamental',
    ...(customProjectTypes || []).map(t => t.toLowerCase()),
  ]
    .filter(Boolean)
    .join(', ')
    .replace(/, ([^,]*)$/, ' and $1') || null;

  const deliveryText = [
    deliveryOptions?.installed && 'INSTALLED',
    deliveryOptions?.fobJobsite && 'F.O.B. Jobsite',
    deliveryOptions?.willCall && 'Will Call',
    selectedCustomDelivery || null,
  ]
    .filter(Boolean)
    .join(', ') || null;

  const allQuals = [...(selectedQualifications || []), ...(customQualifications || [])];
  const allExcls = [...(selectedExclusions || []), ...(customExclusions || [])];

  return (
    <Page size="LETTER" style={styles.page}>
      <CompanyHeader logo={logo} title="ERECTOR SCOPE PACKAGE" projectName={projectName || ''} date={printDate} />

      {/* Project info 2-col */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, fontSize: 8, borderTopWidth: 0.5, borderTopColor: COLORS.medGray, borderTopStyle: 'solid', paddingTop: 6 }}>
        <View style={{ flex: 1 }}>
          {projectAddress ? <Text style={{ marginBottom: 2 }}>{projectAddress}</Text> : null}
          {architect ? <Text><Text style={styles.bold}>Architect: </Text>{architect}</Text> : null}
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          {drawingRevision ? (
            <Text>
              <Text style={styles.bold}>Drawing Set: </Text>
              {drawingRevision}{drawingDateFmt ? `, ${drawingDateFmt}` : ''}
            </Text>
          ) : null}
          {deliveryText ? <Text style={{ marginTop: 2 }}><Text style={styles.bold}>Delivery: </Text>{deliveryText}</Text> : null}
          {estimatedBy ? <Text style={{ marginTop: 2 }}><Text style={styles.bold}>Prepared by: </Text>{estimatedBy}</Text> : null}
        </View>
      </View>

      {/* Intro line */}
      <View style={{ marginBottom: 8, fontSize: 8 }}>
        <Text>
          The following {projectTypesText || 'metal'} items are included in this scope package
          {drawingDateFmt ? `, per drawings dated ${drawingDateFmt}` : ''}:
        </Text>
      </View>

      {/* Item list table */}
      <View style={{ marginBottom: 12 }}>
        <View style={[styles.tableHeader, { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 4 }]}>
          <Text style={{ width: 48, fontSize: 8 }}>Item #</Text>
          <Text style={{ flex: 1, fontSize: 8 }}>Description</Text>
          <Text style={{ width: 100, fontSize: 8 }}>Drawing Reference</Text>
        </View>
        {items.map((item, idx) => (
          <View key={item.id} style={{ flexDirection: 'row', backgroundColor: idx % 2 === 0 ? '#FFFFFF' : COLORS.lightGray, paddingVertical: 2, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: COLORS.medGray, borderBottomStyle: 'solid' }}>
            <Text style={[styles.bold, { width: 48, fontSize: 8 }]}>{item.itemNumber}</Text>
            <Text style={{ flex: 1, fontSize: 8 }}>{item.itemName}</Text>
            <Text style={{ width: 100, fontSize: 8 }}>{item.drawingRef || '-'}</Text>
          </View>
        ))}
      </View>

      {/* Qualifications */}
      {allQuals.length > 0 && (
        <View style={{ marginBottom: 8 }}>
          <Text style={[styles.bold, { fontSize: 8, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray, borderBottomStyle: 'solid', paddingBottom: 2, marginBottom: 3 }]}>QUALIFICATIONS:</Text>
          {allQuals.map((q, i) => (
            <Text key={i} style={{ fontSize: 7, marginBottom: 1 }}>- {q}</Text>
          ))}
        </View>
      )}

      {/* Exclusions */}
      {allExcls.length > 0 && (
        <View style={{ marginBottom: 8 }}>
          <Text style={[styles.bold, { fontSize: 8, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray, borderBottomStyle: 'solid', paddingBottom: 2, marginBottom: 3 }]}>EXCLUSIONS:</Text>
          {allExcls.map((e, i) => (
            <Text key={i} style={{ fontSize: 7, marginBottom: 1 }}>- {e}</Text>
          ))}
        </View>
      )}

      <PageFooter generationDate={genDate} />
    </Page>
  );
};

// ─── Materials table — no pricing columns ───────────────────────────────────
// Columns: Shape/Size | Description | Len (ft) | Qty | Fab Wt | Operation | Qty | Unit

const MaterialsTable = ({ materials }) => {
  const parentMats = materials.filter(m => !m.parentMaterialId);

  // Fixed widths for the right-side columns
  const LEN = 44;
  const PQTY = 32;   // piece qty
  const FABWT = 44;  // fab weight
  const OQTY = 32;   // op qty
  const UNIT = 38;

  return (
    <View style={{ marginBottom: 8 }}>
      {/* Table header */}
      <View style={[styles.tableHeader, { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 4 }]}>
        <Text style={{ flex: 3, fontSize: 8 }}>Shape / Size</Text>
        <Text style={{ flex: 2, fontSize: 8 }}>Description</Text>
        <Text style={{ width: LEN, fontSize: 8, textAlign: 'right' }}>Len (ft)</Text>
        <Text style={{ width: PQTY, fontSize: 8, textAlign: 'right' }}>Qty</Text>
        <Text style={{ width: FABWT, fontSize: 8, textAlign: 'right' }}>Fab Wt</Text>
        <Text style={{ flex: 2, fontSize: 8, marginLeft: 8 }}>Operation</Text>
        <Text style={{ width: OQTY, fontSize: 8, textAlign: 'right' }}>Qty</Text>
        <Text style={{ width: UNIT, fontSize: 8, textAlign: 'right' }}>Unit</Text>
      </View>

      {parentMats.map((mat) => {
        const children = materials.filter(m => m.parentMaterialId === mat.id);
        const matFabOps = visibleFabOps(mat.fabrication);

        return (
          <View key={mat.id}>
            {/* Parent material row */}
            <View style={{ flexDirection: 'row', backgroundColor: COLORS.lightBlue, paddingVertical: 3, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: COLORS.medGray, borderBottomStyle: 'solid' }}>
              <Text style={[styles.bold, { flex: 3, fontSize: 8 }]}>{mat.size || '-'}</Text>
              <Text style={{ flex: 2, fontSize: 8 }}>{mat.description || ''}</Text>
              <Text style={{ width: LEN, fontSize: 8, textAlign: 'right' }}>{mat.length ? mat.length.toFixed(2) : '-'}</Text>
              <Text style={{ width: PQTY, fontSize: 8, textAlign: 'right' }}>{mat.pieces || mat.quantity || '-'}</Text>
              <Text style={{ width: FABWT, fontSize: 8, textAlign: 'right' }}>{mat.fabWeight ? roundCustom(mat.fabWeight).toLocaleString() : ''}</Text>
              <Text style={{ flex: 2, fontSize: 8, marginLeft: 8 }} />
              <Text style={{ width: OQTY, fontSize: 8 }} />
              <Text style={{ width: UNIT, fontSize: 8 }} />
            </View>

            {/* Parent fab ops — green sub-rows */}
            {matFabOps.map(f => (
              <View key={f.id} style={{ flexDirection: 'row', backgroundColor: COLORS.lightGreen, paddingVertical: 2, paddingHorizontal: 4, paddingLeft: 16, borderBottomWidth: 0.5, borderBottomColor: COLORS.medGray, borderBottomStyle: 'solid' }}>
                <Text style={{ flex: 3, fontSize: 7 }} />
                <Text style={{ flex: 2, fontSize: 7 }} />
                <Text style={{ width: LEN, fontSize: 7 }} />
                <Text style={{ width: PQTY, fontSize: 7 }} />
                <Text style={{ width: FABWT, fontSize: 7 }} />
                <Text style={[styles.bold, { flex: 2, fontSize: 7, color: COLORS.green, marginLeft: 8 }]}>
                  {f.operation === 'Custom' ? (f.customOperation || 'Custom') : (f.operation || '')}
                </Text>
                <Text style={{ width: OQTY, fontSize: 7, textAlign: 'right', color: COLORS.green }}>{f.qty || ''}</Text>
                <Text style={{ width: UNIT, fontSize: 7, textAlign: 'right', color: COLORS.green }}>{f.unit || ''}</Text>
              </View>
            ))}

            {/* Child materials */}
            {children.map(child => {
              const childFabOps = visibleFabOps(child.fabrication);
              return (
                <View key={child.id}>
                  <View style={{ flexDirection: 'row', backgroundColor: '#F9FAFB', paddingVertical: 3, paddingHorizontal: 4, paddingLeft: 16, borderBottomWidth: 0.5, borderBottomColor: COLORS.medGray, borderBottomStyle: 'solid' }}>
                    <Text style={{ flex: 3, fontSize: 8, color: COLORS.gray }}>  {child.size || '-'}</Text>
                    <Text style={{ flex: 2, fontSize: 8, color: COLORS.gray }}>{child.description || ''}</Text>
                    <Text style={{ width: LEN, fontSize: 8, textAlign: 'right', color: COLORS.gray }}>{child.length ? child.length.toFixed(2) : '-'}</Text>
                    <Text style={{ width: PQTY, fontSize: 8, textAlign: 'right', color: COLORS.gray }}>{child.pieces || child.quantity || '-'}</Text>
                    <Text style={{ width: FABWT, fontSize: 8, textAlign: 'right', color: COLORS.gray }}>{child.fabWeight ? roundCustom(child.fabWeight).toLocaleString() : ''}</Text>
                    <Text style={{ flex: 2, fontSize: 8, marginLeft: 8 }} />
                    <Text style={{ width: OQTY, fontSize: 8 }} />
                    <Text style={{ width: UNIT, fontSize: 8 }} />
                  </View>
                  {childFabOps.map(f => (
                    <View key={f.id} style={{ flexDirection: 'row', backgroundColor: COLORS.lightGreen, paddingVertical: 2, paddingHorizontal: 4, paddingLeft: 24, borderBottomWidth: 0.5, borderBottomColor: COLORS.medGray, borderBottomStyle: 'solid' }}>
                      <Text style={{ flex: 3, fontSize: 7 }} />
                      <Text style={{ flex: 2, fontSize: 7 }} />
                      <Text style={{ width: LEN, fontSize: 7 }} />
                      <Text style={{ width: PQTY, fontSize: 7 }} />
                      <Text style={{ width: FABWT, fontSize: 7 }} />
                      <Text style={[styles.bold, { flex: 2, fontSize: 7, color: COLORS.green, marginLeft: 8 }]}>
                        {f.operation === 'Custom' ? (f.customOperation || 'Custom') : (f.operation || '')}
                      </Text>
                      <Text style={{ width: OQTY, fontSize: 7, textAlign: 'right', color: COLORS.green }}>{f.qty || ''}</Text>
                      <Text style={{ width: UNIT, fontSize: 7, textAlign: 'right', color: COLORS.green }}>{f.unit || ''}</Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
};

// Item-level fab ops
const ItemFabOpsTable = ({ fabrication }) => {
  const ops = visibleFabOps(fabrication);
  if (!ops.length) return null;
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={[styles.bold, { fontSize: 8, marginBottom: 3, color: COLORS.headerBg }]}>Item-Level Operations</Text>
      <View style={[styles.tableHeader, { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 4 }]}>
        <Text style={{ flex: 3, fontSize: 8 }}>Operation</Text>
        <Text style={{ width: 48, fontSize: 8, textAlign: 'right' }}>Qty</Text>
        <Text style={{ width: 60, fontSize: 8, textAlign: 'right' }}>Unit</Text>
      </View>
      {ops.map((f, idx) => (
        <View key={f.id} style={{ flexDirection: 'row', backgroundColor: idx % 2 === 0 ? '#FFFFFF' : COLORS.lightGray, paddingVertical: 2, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: COLORS.medGray, borderBottomStyle: 'solid' }}>
          <Text style={{ flex: 3, fontSize: 8 }}>
            {f.operation === 'Custom' ? (f.customOperation || 'Custom') : (f.operation || '')}
          </Text>
          <Text style={{ width: 48, fontSize: 8, textAlign: 'right' }}>{f.qty || ''}</Text>
          <Text style={{ width: 60, fontSize: 8, textAlign: 'right' }}>{f.unit || ''}</Text>
        </View>
      ))}
    </View>
  );
};

// Item-level fab weight summary
const FabWeightSummary = ({ materials }) => {
  const totalFabWt = (materials || []).reduce((s, m) => s + (m.fabWeight || 0), 0);
  if (!totalFabWt) return null;
  return (
    <View style={{ alignItems: 'flex-end', marginBottom: 6 }}>
      <View style={{ flexDirection: 'row', backgroundColor: COLORS.medGray, paddingVertical: 3, paddingHorizontal: 8, minWidth: 180 }}>
        <Text style={[styles.bold, { flex: 1, fontSize: 8 }]}>Total Fab Weight</Text>
        <Text style={[styles.bold, { fontSize: 8, marginLeft: 12 }]}>{roundCustom(totalFabWt).toLocaleString()} lbs</Text>
      </View>
    </View>
  );
};

// Blueprint snapshots grid — 3 images per row, caption below each
const SnapshotsSection = ({ snapshots }) => {
  if (!snapshots || snapshots.length === 0) return null;
  const IMG_W = 160;
  const IMG_H = 110;
  const COLS = 3;
  const GAP = 8;

  const rows = [];
  for (let i = 0; i < snapshots.length; i += COLS) {
    rows.push(snapshots.slice(i, i + COLS));
  }

  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ borderTopWidth: 0.5, borderTopColor: COLORS.medGray, borderTopStyle: 'solid', paddingTop: 6, marginBottom: 6 }}>
        <Text style={[styles.bold, { fontSize: 8, color: COLORS.headerBg }]}>Blueprint Snapshots</Text>
      </View>
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={{ flexDirection: 'row', gap: GAP, marginBottom: GAP + 2 }}>
          {row.map(snap => (
            <View key={snap.id} style={{ width: IMG_W }}>
              {snap.imageData ? (
                <Image
                  src={snap.imageData}
                  style={{ width: IMG_W, height: IMG_H, objectFit: 'contain', borderWidth: 0.5, borderColor: COLORS.medGray, borderStyle: 'solid' }}
                />
              ) : null}
              {snap.caption ? (
                <Text style={{ fontSize: 7, color: COLORS.gray, marginTop: 2, textAlign: 'center' }}>
                  {snap.caption}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
};

export const ErectorScopePdf = ({
  logo,
  projectName,
  projectAddress,
  drawingRevision,
  drawingDate,
  estimateDate,
  estimatedBy,
  architect,
  projectTypes,
  deliveryOptions,
  customProjectTypes = [],
  selectedCustomDelivery = null,
  selectedExclusions,
  customExclusions,
  selectedQualifications,
  customQualifications,
  items,
}) => {
  const genDate = new Date().toLocaleDateString();
  const dateHeader = estimateDate
    ? new Date(estimateDate).toLocaleDateString()
    : genDate;

  return (
    <Document title={`Erector Scope — ${projectName || 'Project'}`}>
      {/* Summary page — price-redacted cover */}
      <ErectorSummaryPage
        logo={logo}
        projectName={projectName}
        projectAddress={projectAddress}
        drawingRevision={drawingRevision}
        drawingDate={drawingDate}
        estimateDate={estimateDate}
        estimatedBy={estimatedBy}
        architect={architect}
        projectTypes={projectTypes}
        deliveryOptions={deliveryOptions}
        customProjectTypes={customProjectTypes}
        selectedCustomDelivery={selectedCustomDelivery}
        items={items}
        selectedExclusions={selectedExclusions}
        customExclusions={customExclusions}
        selectedQualifications={selectedQualifications}
        customQualifications={customQualifications}
      />

      {/* One detail page per item */}
      {items.map((item) => (
        <Page key={item.id} size="LETTER" style={styles.page} break>
          <CompanyHeader
            logo={logo}
            title="ERECTOR SCOPE PACKAGE"
            projectName={projectName || ''}
            date={dateHeader}
          />

          <SectionBar
            label={`Item ${item.itemNumber}: ${item.itemName}`}
            right={item.drawingRef || ''}
          />

          {/* Drawing revision only — no address or preparer */}
          {drawingRevision ? (
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8, fontSize: 8, color: COLORS.gray }}>
              <Text>Drawing Rev: {drawingRevision}</Text>
            </View>
          ) : (
            <View style={{ marginBottom: 8 }} />
          )}

          {item.materials && item.materials.length > 0 ? (
            <MaterialsTable materials={item.materials} />
          ) : (
            <Text style={{ fontSize: 8, color: COLORS.gray, marginBottom: 8 }}>No materials on this item.</Text>
          )}

          {item.fabrication && item.fabrication.length > 0 && (
            <ItemFabOpsTable fabrication={item.fabrication} />
          )}

          <FabWeightSummary materials={item.materials} />

          <SnapshotsSection snapshots={item.snapshots} />

          <PageFooter generationDate={genDate} />
        </Page>
      ))}
    </Document>
  );
};
