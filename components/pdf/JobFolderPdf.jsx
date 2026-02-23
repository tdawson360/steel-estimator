import React from 'react';
import { Document, Page, View, Text, Image } from '@react-pdf/renderer';
import { styles, COLORS, CompanyHeader, PageFooter, SectionBar } from './PdfShared';
import { fmtPrice, fmtQuotePrice, getItemTotal, getItemCostBreakdown, visibleFabOps, roundCustom } from './pdfUtils';

// ─── Shared: Blueprint Snapshots grid ──────────────────────────────────────

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

// ─── Section 1: Customer Quote ─────────────────────────────────────────────

const QuotePage = ({
  logo,
  projectName,
  projectAddress,
  customerName,
  billingAddress,
  customerContact,
  customerPhone,
  customerEmail,
  estimateDate,
  estimatedBy,
  drawingDate,
  drawingRevision,
  architect,
  projectTypes,
  deliveryOptions,
  taxCategory,
  customProjectTypes = [],
  selectedCustomDelivery = null,
  items,
  breakoutTotals,
  selectedExclusions,
  customExclusions,
  selectedQualifications,
  customQualifications,
  totals,
}) => {
  const genDate = new Date().toLocaleDateString();
  const printDate = estimateDate ? new Date(estimateDate).toLocaleDateString() : genDate;
  const drawingDateFmt = drawingDate ? new Date(drawingDate).toLocaleDateString() : '_______________';

  const projectTypesText = [
    projectTypes?.structural && 'structural',
    projectTypes?.miscellaneous && 'miscellaneous',
    projectTypes?.ornamental && 'ornamental',
    ...(customProjectTypes || []).map(t => t.toLowerCase()),
  ]
    .filter(Boolean)
    .join(', ')
    .replace(/, ([^,]*)$/, ' and $1') || '_______________';

  const deliveryText = [
    deliveryOptions?.installed && 'INSTALLED',
    deliveryOptions?.fobJobsite && 'F.O.B. JOBSITE',
    deliveryOptions?.willCall && 'WILL CALL',
    selectedCustomDelivery ? selectedCustomDelivery.toUpperCase() : null,
  ]
    .filter(Boolean)
    .join(', ') || '_______________';

  const baseItems = items.filter(item => {
    const inAdds = breakoutTotals?.adds?.some(g => g.items?.some(i => i.id === item.id));
    return !inAdds;
  });
  const addItems = items.filter(item =>
    breakoutTotals?.adds?.some(g => g.items?.some(i => i.id === item.id))
  );

  const hasBreakouts =
    (breakoutTotals?.deducts?.length > 0) || (breakoutTotals?.adds?.length > 0);

  const allQuals = [...(selectedQualifications || []), ...(customQualifications || [])];
  const allExcls = [...(selectedExclusions || []), ...(customExclusions || [])];

  const taxIncluded =
    taxCategory && taxCategory !== 'resale' && taxCategory !== 'noTax' && totals?.totalTax > 0;

  return (
    <Page size="LETTER" style={styles.page}>
      {/* Company Header */}
      <View style={{ borderBottomWidth: 1.5, borderBottomColor: COLORS.black, borderBottomStyle: 'solid', paddingBottom: 6, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        {logo ? (
          <Image src={logo} style={{ height: 48, maxWidth: 180, objectFit: 'contain' }} />
        ) : (
          <Text style={[styles.bold, { fontSize: 13 }]}>Berger Iron Works</Text>
        )}
        <Text style={[styles.bold, { fontSize: 16, color: COLORS.headerBg, alignSelf: 'center' }]}>QUOTATION</Text>
      </View>

      {/* Legal terms */}
      <View style={{ marginBottom: 8, fontSize: 7, color: '#374151', lineHeight: 1.4 }}>
        <Text style={{ marginBottom: 3 }}>
          We propose to furnish the following described materials for the above structure, in accordance with the conditions of the Code of Standard Practice of American Institute of Steel Construction and the following terms and conditions, which upon acceptance by you of this proposal, are agreed to and accepted by you.
        </Text>
        {(!taxCategory || taxCategory === 'resale' || taxCategory === 'noTax') && (
          <Text style={{ marginBottom: 3 }}>
            <Text style={styles.bold}>NOTE: </Text>
            The prices quoted in the proposal DO NOT INCLUDE TAX OF ANY NATURE, "STATE, FEDERAL, LOCAL OR USE."
          </Text>
        )}
        <Text>
          <Text style={styles.bold}>Acceptance {'&'} Approval of Contract: </Text>
          This proposal is made for acceptance by you in writing within 30 days from this date, and shall become a contract only upon approval thereafter by our Contracting Manager, or other authorized personnel.
        </Text>
      </View>

      {/* Project info 2-col */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, fontSize: 8, borderTopWidth: 0.5, borderTopColor: COLORS.medGray, borderTopStyle: 'solid', paddingTop: 6 }}>
        <View style={{ flex: 1 }}>
          <Text>{customerName || '_______________'}</Text>
          <Text>{billingAddress || '_______________'}</Text>
          <Text>{customerContact || '_______________'}</Text>
          <Text>{customerEmail || '_______________'}</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text>{printDate}</Text>
          <Text><Text style={styles.bold}>JOB: </Text>{projectName || '_______________'}</Text>
          <Text><Text style={styles.bold}>LOCATION: </Text>{projectAddress || '_______________'}</Text>
          <Text><Text style={styles.bold}>ARCHITECT: </Text>{architect || '_______________'}</Text>
          <Text>
            <Text style={styles.bold}>DRAWING SET: </Text>
            {drawingRevision || '_______________'}
            {drawingDate ? `, ${drawingDateFmt}` : ''}
          </Text>
        </View>
      </View>

      {/* Greeting */}
      <View style={{ marginBottom: 8, fontSize: 8 }}>
        <Text>Valued Customer,</Text>
        <Text style={{ marginTop: 3 }}>
          We are pleased to quote you on the following {projectTypesText} metal items in accordance with the drawings dated {drawingDateFmt}:
        </Text>
      </View>

      {/* Item list table */}
      <View style={{ marginBottom: 8 }}>
        {/* Header */}
        <View style={[styles.tableHeader, { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 4 }]}>
          <Text style={{ width: 48, fontSize: 8 }}>Item #</Text>
          <Text style={{ flex: 1, fontSize: 8 }}>Description</Text>
          <Text style={{ width: 100, fontSize: 8 }}>Drawing Reference</Text>
        </View>
        {baseItems.map((item, idx) => (
          <View key={item.id} style={{ flexDirection: 'row', backgroundColor: idx % 2 === 0 ? '#FFFFFF' : COLORS.lightGray, paddingVertical: 2, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: COLORS.medGray, borderBottomStyle: 'solid' }}>
            <Text style={[styles.bold, { width: 48, fontSize: 8 }]}>{item.itemNumber}</Text>
            <Text style={{ flex: 1, fontSize: 8 }}>{item.itemName}</Text>
            <Text style={{ width: 100, fontSize: 8 }}>{item.drawingRef || '-'}</Text>
          </View>
        ))}
        {addItems.length > 0 && (
          <View style={{ marginTop: 4 }}>
            <Text style={{ fontSize: 7, color: COLORS.gray, marginBottom: 2 }}>Additional items available (see Add Options below):</Text>
            {addItems.map(item => (
              <View key={item.id} style={{ flexDirection: 'row', paddingVertical: 2, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: COLORS.medGray, borderBottomStyle: 'solid' }}>
                <Text style={{ width: 48, fontSize: 7, color: COLORS.gray }}>{item.itemNumber}</Text>
                <Text style={{ flex: 1, fontSize: 7, color: COLORS.gray }}>{item.itemName}</Text>
                <Text style={{ width: 100, fontSize: 7, color: COLORS.gray }}>{item.drawingRef || '-'}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Base bid box */}
      <View style={{ marginBottom: 8, padding: 10, backgroundColor: '#F9FAFB', borderWidth: 1.5, borderColor: COLORS.black, borderStyle: 'solid', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Text style={[styles.bold, { fontSize: 10 }]}>{hasBreakouts ? 'BASE BID' : 'ALL FOR THE SUM OF'}</Text>
          <Text style={{ fontSize: 10 }}> .......... </Text>
          <Text style={[styles.bold, { fontSize: 10 }]}>{deliveryText}</Text>
          <Text style={{ fontSize: 10 }}>.............. </Text>
          <Text style={[styles.bold, { fontSize: 12, borderBottomWidth: 1.5, borderBottomColor: COLORS.black, borderBottomStyle: 'solid', paddingBottom: 1 }]}>
            {fmtQuotePrice(breakoutTotals?.baseBid || 0)}
          </Text>
        </View>
        {taxIncluded && (
          <Text style={[styles.bold, { fontSize: 8, marginTop: 3, color: COLORS.gray }]}>TAX INCLUDED</Text>
        )}
      </View>

      {/* Deduct options */}
      {breakoutTotals?.deducts?.length > 0 && (
        <View style={{ marginBottom: 6, padding: 6, borderWidth: 1, borderColor: '#FCA5A5', borderStyle: 'solid', backgroundColor: '#FFF5F5' }}>
          <Text style={[styles.bold, { fontSize: 8, color: COLORS.red, marginBottom: 4 }]}>DEDUCT OPTIONS:</Text>
          {breakoutTotals.deducts.map(d => (
            <View key={d.id} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
              <Text style={{ fontSize: 8, flex: 1 }}>If {d.name || 'this scope'} is removed from Berger Iron's scope, please deduct from the base bid.</Text>
              <Text style={[styles.bold, { fontSize: 8, marginLeft: 8 }]}>{fmtQuotePrice(d.total)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Add options */}
      {breakoutTotals?.adds?.length > 0 && (
        <View style={{ marginBottom: 6, padding: 6, borderWidth: 1, borderColor: '#86EFAC', borderStyle: 'solid', backgroundColor: '#F0FFF4' }}>
          <Text style={[styles.bold, { fontSize: 8, color: COLORS.green, marginBottom: 4 }]}>ADD OPTIONS:</Text>
          {breakoutTotals.adds.map(a => (
            <View key={a.id} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
              <Text style={{ fontSize: 8, flex: 1 }}>If Berger Iron is to provide the additional {a.name || 'scope'}, please add to the base bid.</Text>
              <Text style={[styles.bold, { fontSize: 8, marginLeft: 8 }]}>{fmtQuotePrice(a.total)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Qualifications */}
      {allQuals.length > 0 && (
        <View style={{ marginBottom: 6 }}>
          <Text style={[styles.bold, { fontSize: 8, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray, borderBottomStyle: 'solid', paddingBottom: 2, marginBottom: 3 }]}>QUALIFICATIONS:</Text>
          {allQuals.map((q, i) => (
            <Text key={i} style={{ fontSize: 7, marginBottom: 1 }}>- {q}</Text>
          ))}
        </View>
      )}

      {/* Exclusions */}
      {allExcls.length > 0 && (
        <View style={{ marginBottom: 10 }}>
          <Text style={[styles.bold, { fontSize: 8, borderBottomWidth: 0.5, borderBottomColor: COLORS.gray, borderBottomStyle: 'solid', paddingBottom: 2, marginBottom: 3 }]}>EXCLUSIONS:</Text>
          {allExcls.map((e, i) => (
            <Text key={i} style={{ fontSize: 7, marginBottom: 1 }}>- {e}</Text>
          ))}
        </View>
      )}

      {/* Signature block */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: COLORS.medGray, borderTopStyle: 'solid', paddingTop: 8, marginTop: 4 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 8, marginBottom: 18 }}>Respectfully submitted,</Text>
          <View style={{ borderBottomWidth: 0.5, borderBottomColor: COLORS.black, borderBottomStyle: 'solid', width: 140, marginBottom: 3 }} />
          <Text style={[styles.bold, { fontSize: 8 }]}>{estimatedBy || 'Estimator'}</Text>
          <Text style={{ fontSize: 7, color: COLORS.gray }}>Date: {printDate}</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 14 }}>
            <Text style={{ fontSize: 8, marginRight: 4 }}>Accepted By:</Text>
            <View style={{ borderBottomWidth: 0.5, borderBottomColor: COLORS.black, borderBottomStyle: 'solid', width: 120 }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 14 }}>
            <Text style={{ fontSize: 8, marginRight: 4 }}>Authorized Signature:</Text>
            <View style={{ borderBottomWidth: 0.5, borderBottomColor: COLORS.black, borderBottomStyle: 'solid', width: 100 }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 8, marginRight: 4 }}>Date:</Text>
            <View style={{ borderBottomWidth: 0.5, borderBottomColor: COLORS.black, borderBottomStyle: 'solid', width: 140 }} />
          </View>
        </View>
      </View>

      {/* Agreement footer */}
      <View style={{ marginTop: 10, borderTopWidth: 0.5, borderTopColor: COLORS.medGray, borderTopStyle: 'solid', paddingTop: 4, alignItems: 'center' }}>
        <Text style={{ fontSize: 7, color: COLORS.gray }}>All agreements contingent upon Fires, Strikes, Embargoes, or all other causes beyond our control.</Text>
      </View>

      <PageFooter generationDate={new Date().toLocaleDateString()} />
    </Page>
  );
};

// ─── Section 2: Itemized Estimate ──────────────────────────────────────────

const EstimateItemPage = ({ item, logo, projectName, estimateDate }) => {
  const parentMats = item.materials.filter(m => !m.parentMaterialId);
  const genDate = new Date().toLocaleDateString();
  const dateHeader = estimateDate ? new Date(estimateDate).toLocaleDateString() : genDate;

  const matCost = item.materials.reduce((s, m) => s + (m.totalCost || 0), 0);
  const matMarkupAmt = matCost * (item.materialMarkup || 0) / 100;
  const matFabCost = item.materials.reduce((s, m) => {
    return s + (m.fabrication ? m.fabrication.reduce((fs, f) => fs + (f.totalCost || 0), 0) : 0);
  }, 0);
  const itemFabCostAmt = item.fabrication.reduce((s, f) => s + (f.totalCost || 0), 0);
  const fabCost = matFabCost + itemFabCostAmt;
  const fabMarkupAmt = fabCost * (item.fabMarkup || 0) / 100;
  const recapCost = Object.values(item.recapCosts).reduce((s, c) => s + (c.total || 0), 0);
  const itemTotal = matCost + matMarkupAmt + fabCost + fabMarkupAmt + recapCost;
  // Pre-compute fab weight so we avoid an IIFE inside JSX (unreliable in @react-pdf/renderer)
  const totalFabWt = (item.materials || []).reduce((s, m) => s + (m.fabWeight || 0), 0);

  // Fixed widths for right-side columns; size column uses flex:1 to fill remaining width
  const COL = { len: 44, qty: 32, wt: 40, fabWt: 48, rate: 48, total: 52 };

  const renderFabRow = (f, indent) => {
    if (f.isAutoGalv || f.isConnGalv) return null;
    const opName = f.operation === 'Custom' ? (f.customOperation || 'Custom') : (f.operation || '');
    return (
      <View key={f.id} style={{ flexDirection: 'row', backgroundColor: COLORS.lightGreen, paddingVertical: 2, paddingHorizontal: 4, paddingLeft: indent, borderBottomWidth: 0.5, borderBottomColor: COLORS.medGray, borderBottomStyle: 'solid' }}>
        <Text style={{ flex: 1, fontSize: 7, color: COLORS.green }}>{opName}</Text>
        <Text style={{ width: COL.len, fontSize: 7 }} />
        <Text style={{ width: COL.qty, fontSize: 7, textAlign: 'right', color: COLORS.green }}>{f.quantity || ''}</Text>
        <Text style={{ width: COL.wt, fontSize: 7 }} />
        <Text style={{ width: COL.fabWt, fontSize: 7 }} />
        <Text style={{ width: COL.rate, fontSize: 7, textAlign: 'right', color: COLORS.green }}>{f.rate ? fmtPrice(f.rate) : ''}</Text>
        <Text style={{ width: COL.total, fontSize: 7, textAlign: 'right', color: COLORS.green }}>{f.totalCost ? fmtPrice(f.totalCost) : ''}</Text>
      </View>
    );
  };

  return (
    <Page size="LETTER" style={styles.page} break>
      <CompanyHeader logo={logo} title="ITEMIZED ESTIMATE" projectName={projectName || ''} date={dateHeader} />
      <SectionBar label={`Item ${item.itemNumber}: ${item.itemName}`} right={item.drawingRef || ''} />

      {/* Materials header — size column is flex:1, right-side columns fixed */}
      <View style={[styles.tableHeader, { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 4, marginBottom: 0 }]}>
        <Text style={{ flex: 1, fontSize: 8 }}>Shape / Size</Text>
        <Text style={{ width: COL.len, fontSize: 8, textAlign: 'right' }}>Len (ft)</Text>
        <Text style={{ width: COL.qty, fontSize: 8, textAlign: 'right' }}>Qty</Text>
        <Text style={{ width: COL.wt, fontSize: 8, textAlign: 'right' }}>Wt/ft</Text>
        <Text style={{ width: COL.fabWt, fontSize: 8, textAlign: 'right' }}>Fab Wt</Text>
        <Text style={{ width: COL.rate, fontSize: 8, textAlign: 'right' }}>$/unit</Text>
        <Text style={{ width: COL.total, fontSize: 8, textAlign: 'right' }}>Total</Text>
      </View>

      {parentMats.map((mat, idx) => {
        const children = item.materials.filter(m => m.parentMaterialId === mat.id);
        const matFabRows = visibleFabOps(mat.fabrication);
        return (
          <View key={mat.id}>
            {/* Parent row */}
            <View style={{ flexDirection: 'row', backgroundColor: COLORS.lightBlue, paddingVertical: 3, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: COLORS.medGray, borderBottomStyle: 'solid' }}>
              <Text style={[styles.bold, { flex: 1, fontSize: 8 }]}>{mat.size || '-'}</Text>
              <Text style={{ width: COL.len, fontSize: 8, textAlign: 'right' }}>{mat.length ? mat.length.toFixed(2) : '-'}</Text>
              <Text style={{ width: COL.qty, fontSize: 8, textAlign: 'right' }}>{mat.pieces || mat.quantity || '-'}</Text>
              <Text style={{ width: COL.wt, fontSize: 8, textAlign: 'right' }}>{mat.weightPerFoot ? mat.weightPerFoot.toFixed(1) : ''}</Text>
              <Text style={{ width: COL.fabWt, fontSize: 8, textAlign: 'right' }}>{mat.fabWeight ? roundCustom(mat.fabWeight).toLocaleString() : ''}</Text>
              <Text style={{ width: COL.rate, fontSize: 8, textAlign: 'right' }}>{mat.unitPrice ? fmtPrice(mat.unitPrice) : ''}</Text>
              <Text style={{ width: COL.total, fontSize: 8, textAlign: 'right' }}>{mat.totalCost ? fmtPrice(mat.totalCost) : ''}</Text>
            </View>
            {matFabRows.map(f => renderFabRow(f, 12))}

            {children.map(child => {
              const childFabRows = visibleFabOps(child.fabrication);
              return (
                <View key={child.id}>
                  <View style={{ flexDirection: 'row', backgroundColor: '#F9FAFB', paddingVertical: 3, paddingHorizontal: 4, paddingLeft: 16, borderBottomWidth: 0.5, borderBottomColor: COLORS.medGray, borderBottomStyle: 'solid' }}>
                    <Text style={{ flex: 1, fontSize: 8, color: COLORS.gray }}>  {child.size || '-'}</Text>
                    <Text style={{ width: COL.len, fontSize: 8, textAlign: 'right', color: COLORS.gray }}>{child.length ? child.length.toFixed(2) : '-'}</Text>
                    <Text style={{ width: COL.qty, fontSize: 8, textAlign: 'right', color: COLORS.gray }}>{child.pieces || child.quantity || '-'}</Text>
                    <Text style={{ width: COL.wt, fontSize: 8, textAlign: 'right', color: COLORS.gray }}>{child.weightPerFoot ? child.weightPerFoot.toFixed(1) : ''}</Text>
                    <Text style={{ width: COL.fabWt, fontSize: 8, textAlign: 'right', color: COLORS.gray }}>{child.fabWeight ? roundCustom(child.fabWeight).toLocaleString() : ''}</Text>
                    <Text style={{ width: COL.rate, fontSize: 8, textAlign: 'right', color: COLORS.gray }}>{child.unitPrice ? fmtPrice(child.unitPrice) : ''}</Text>
                    <Text style={{ width: COL.total, fontSize: 8, textAlign: 'right', color: COLORS.gray }}>{child.totalCost ? fmtPrice(child.totalCost) : ''}</Text>
                  </View>
                  {childFabRows.map(f => renderFabRow(f, 20))}
                </View>
              );
            })}
          </View>
        );
      })}

      {/* Item-level fab ops */}
      {visibleFabOps(item.fabrication).length > 0 && (
        <View style={{ marginTop: 4 }}>
          <Text style={[styles.bold, { fontSize: 7, color: COLORS.gray, paddingLeft: 4, marginBottom: 2 }]}>Item-Level Operations</Text>
          {visibleFabOps(item.fabrication).map(f => renderFabRow(f, 4))}
        </View>
      )}

      {/* Item subtotals */}
      <View style={{ marginTop: 8, alignItems: 'flex-end' }}>
        <View style={{ width: 240 }}>
          {/* Fab weight summary — pre-computed above to avoid IIFE in JSX */}
          {totalFabWt > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, paddingHorizontal: 6, marginBottom: 4, backgroundColor: COLORS.medGray }}>
              <Text style={[styles.bold, { fontSize: 8 }]}>Total Fab Weight</Text>
              <Text style={[styles.bold, { fontSize: 8 }]}>{roundCustom(totalFabWt).toLocaleString()} lbs</Text>
            </View>
          )}
          {[
            { label: 'Material', val: matCost, show: true },
            { label: `Mat Markup (${item.materialMarkup || 0}%)`, val: matMarkupAmt, show: matMarkupAmt > 0 },
            { label: 'Fabrication', val: fabCost, show: true },
            { label: `Fab Markup (${item.fabMarkup || 0}%)`, val: fabMarkupAmt, show: fabMarkupAmt > 0 },
            { label: 'Recap', val: recapCost, show: recapCost > 0 },
          ].filter(r => r.show).map((r, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: COLORS.medGray, borderBottomStyle: 'solid' }}>
              <Text style={{ fontSize: 8, color: COLORS.gray }}>{r.label}</Text>
              <Text style={{ fontSize: 8, textAlign: 'right' }}>{fmtPrice(r.val)}</Text>
            </View>
          ))}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, paddingHorizontal: 6, backgroundColor: COLORS.headerBg }}>
            <Text style={[styles.bold, { fontSize: 9, color: '#FFFFFF' }]}>Item Total</Text>
            <Text style={[styles.bold, { fontSize: 9, color: '#FFFFFF' }]}>{fmtPrice(itemTotal)}</Text>
          </View>
        </View>
      </View>

      <SnapshotsSection snapshots={item.snapshots} />

      <PageFooter generationDate={new Date().toLocaleDateString()} />
    </Page>
  );
};

// ─── Section 3: Itemized Recap ──────────────────────────────────────────────

const STANDARD_RECAP_COLS = [
  { key: 'installation', label: 'Install' },
  { key: 'drafting', label: 'Drafting' },
  { key: 'engineering', label: 'Engrg' },
  { key: 'projectManagement', label: 'PM' },
  { key: 'shipping', label: 'Shipping' },
];

const RecapPage = ({ logo, projectName, estimateDate, items, customRecapColumns, totals, taxCategory, breakoutTotals }) => {
  const genDate = new Date().toLocaleDateString();
  const dateHeader = estimateDate ? new Date(estimateDate).toLocaleDateString() : genDate;

  const allCols = [...STANDARD_RECAP_COLS, ...(customRecapColumns || []).map(c => ({ key: c.key, label: c.name }))];
  const landscape = allCols.length > 4;
  const pageStyle = landscape ? styles.pageLandscape : styles.page;
  const pageSize = landscape ? [792, 612] : 'LETTER'; // landscape dimensions

  const COL_ITEM = landscape ? 100 : 110;
  const COL_MAT = 52;
  const COL_FAB = 52;
  const COL_RECAP = landscape ? 44 : 48;
  const COL_TOTAL = 60;

  const totalRecapCols = allCols.length * COL_RECAP + COL_ITEM + COL_MAT + COL_FAB + COL_TOTAL;

  return (
    <Page size={landscape ? [792, 612] : 'LETTER'} orientation={landscape ? 'landscape' : 'portrait'} style={pageStyle} break>
      <CompanyHeader logo={logo} title="ITEMIZED RECAP" projectName={projectName || ''} date={dateHeader} />

      {/* Table header */}
      <View style={[styles.tableHeader, { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 4 }]}>
        <Text style={{ width: COL_ITEM, fontSize: 7 }}>Item</Text>
        <Text style={{ width: COL_MAT, fontSize: 7, textAlign: 'right' }}>Material $</Text>
        <Text style={{ width: COL_FAB, fontSize: 7, textAlign: 'right' }}>Fab $</Text>
        {allCols.map(col => (
          <Text key={col.key} style={{ width: COL_RECAP, fontSize: 7, textAlign: 'right' }}>{col.label}</Text>
        ))}
        <Text style={{ width: COL_TOTAL, fontSize: 7, textAlign: 'right' }}>Item Total</Text>
      </View>

      {/* Item rows */}
      {items.map((item, idx) => {
        const bd = getItemCostBreakdown(item);
        const rowBg = idx % 2 === 0 ? '#FFFFFF' : COLORS.lightGray;
        return (
          <View key={item.id} style={{ flexDirection: 'row', backgroundColor: rowBg, paddingVertical: 2, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: COLORS.medGray, borderBottomStyle: 'solid' }}>
            <Text style={{ width: COL_ITEM, fontSize: 7 }}>{item.itemNumber} - {item.itemName}</Text>
            <Text style={{ width: COL_MAT, fontSize: 7, textAlign: 'right' }}>{fmtPrice(bd.material + bd.matMarkupAmt)}</Text>
            <Text style={{ width: COL_FAB, fontSize: 7, textAlign: 'right' }}>{fmtPrice(bd.fabrication + bd.fabMarkupAmt)}</Text>
            {allCols.map(col => (
              <Text key={col.key} style={{ width: COL_RECAP, fontSize: 7, textAlign: 'right' }}>
                {item.recapCosts?.[col.key]?.total ? fmtPrice(item.recapCosts[col.key].total) : ''}
              </Text>
            ))}
            <Text style={[styles.bold, { width: COL_TOTAL, fontSize: 7, textAlign: 'right' }]}>{fmtPrice(bd.total)}</Text>
          </View>
        );
      })}

      {/* Totals row */}
      <View style={{ flexDirection: 'row', backgroundColor: COLORS.medGray, paddingVertical: 3, paddingHorizontal: 4, marginTop: 2 }}>
        <Text style={[styles.bold, { width: COL_ITEM, fontSize: 8 }]}>TOTALS</Text>
        <Text style={[styles.bold, { width: COL_MAT, fontSize: 8, textAlign: 'right' }]}>{fmtPrice((totals?.totalMaterialCost || 0) + (totals?.totalMaterialMarkup || 0))}</Text>
        <Text style={[styles.bold, { width: COL_FAB, fontSize: 8, textAlign: 'right' }]}>{fmtPrice((totals?.totalFabricationCost || 0) + (totals?.totalFabMarkup || 0))}</Text>
        {allCols.map(col => {
          const colTotal = items.reduce((s, item) => s + (item.recapCosts?.[col.key]?.total || 0), 0);
          return (
            <Text key={col.key} style={[styles.bold, { width: COL_RECAP, fontSize: 8, textAlign: 'right' }]}>
              {colTotal > 0 ? fmtPrice(colTotal) : ''}
            </Text>
          );
        })}
        <Text style={[styles.bold, { width: COL_TOTAL, fontSize: 8, textAlign: 'right' }]}>
          {fmtPrice(items.reduce((s, item) => s + getItemTotal(item), 0))}
        </Text>
      </View>

      {/* Grand total block */}
      <View style={{ alignItems: 'flex-end', marginTop: 10 }}>
        <View style={{ width: 220 }}>
          {totals?.totalTax > 0 && taxCategory && taxCategory !== 'resale' && taxCategory !== 'noTax' && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: COLORS.medGray, borderBottomStyle: 'solid' }}>
              <Text style={{ fontSize: 8, color: COLORS.gray }}>Tax</Text>
              <Text style={{ fontSize: 8, textAlign: 'right' }}>{fmtPrice(totals.totalTax)}</Text>
            </View>
          )}
          {totals?.totalAdjustments !== 0 && totals?.totalAdjustments != null && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: COLORS.medGray, borderBottomStyle: 'solid' }}>
              <Text style={{ fontSize: 8, color: COLORS.gray }}>Adjustments</Text>
              <Text style={{ fontSize: 8, textAlign: 'right' }}>{fmtPrice(totals.totalAdjustments)}</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, paddingHorizontal: 6, backgroundColor: COLORS.headerBg }}>
            <Text style={[styles.bold, { fontSize: 10, color: '#FFFFFF' }]}>GRAND TOTAL</Text>
            <Text style={[styles.bold, { fontSize: 10, color: '#FFFFFF' }]}>{fmtQuotePrice(totals?.grandTotal || 0)}</Text>
          </View>
        </View>
      </View>

      <PageFooter generationDate={new Date().toLocaleDateString()} />
    </Page>
  );
};

// ─── Main Document ──────────────────────────────────────────────────────────

export const JobFolderPdf = ({
  logo,
  projectName,
  projectAddress,
  customerName,
  billingAddress,
  customerContact,
  customerPhone,
  customerEmail,
  estimateDate,
  estimatedBy,
  drawingDate,
  drawingRevision,
  architect,
  projectTypes,
  deliveryOptions,
  taxCategory,
  customProjectTypes = [],
  selectedCustomDelivery = null,
  items,
  breakoutTotals,
  selectedExclusions,
  customExclusions,
  selectedQualifications,
  customQualifications,
  customRecapColumns,
  totals,
}) => {
  return (
    <Document title={`Job Folder — ${projectName || 'Project'}`}>
      {/* Section 1: Customer Quote */}
      <QuotePage
        logo={logo}
        projectName={projectName}
        projectAddress={projectAddress}
        customerName={customerName}
        billingAddress={billingAddress}
        customerContact={customerContact}
        customerPhone={customerPhone}
        customerEmail={customerEmail}
        estimateDate={estimateDate}
        estimatedBy={estimatedBy}
        drawingDate={drawingDate}
        drawingRevision={drawingRevision}
        architect={architect}
        projectTypes={projectTypes}
        deliveryOptions={deliveryOptions}
        taxCategory={taxCategory}
        customProjectTypes={customProjectTypes}
        selectedCustomDelivery={selectedCustomDelivery}
        items={items}
        breakoutTotals={breakoutTotals}
        selectedExclusions={selectedExclusions}
        customExclusions={customExclusions}
        selectedQualifications={selectedQualifications}
        customQualifications={customQualifications}
        totals={totals}
      />

      {/* Section 2: Itemized Estimate (one page per item) */}
      {items.map(item => (
        <EstimateItemPage
          key={item.id}
          item={item}
          logo={logo}
          projectName={projectName}
          estimateDate={estimateDate}
        />
      ))}

      {/* Section 3: Itemized Recap */}
      <RecapPage
        logo={logo}
        projectName={projectName}
        estimateDate={estimateDate}
        items={items}
        customRecapColumns={customRecapColumns}
        totals={totals}
        taxCategory={taxCategory}
        breakoutTotals={breakoutTotals}
      />
    </Document>
  );
};
