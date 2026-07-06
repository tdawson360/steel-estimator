import React from 'react';
import { Document, Page, View, Text } from '@react-pdf/renderer';
import { styles, COLORS, CompanyHeader, PageFooter, SectionBar } from './PdfShared';
import { fmtRate4, fmtPrice, roundCustom } from './pdfUtils';

// Column widths for the buy list table (sums to 100%)
const COL = {
  item: '9%',
  size: '17%',
  len: '10%',
  qty: '8%',
  wpf: '8%',
  wt: '15%',
  units: '7%',
  rate: '11%',
  cost: '15%',
};

const fmtWt = (num) => roundCustom(num).toLocaleString();

const HeaderRow = () => (
  <View style={[styles.tableHeader, { flexDirection: 'row', paddingVertical: 3 }]} fixed>
    <Text style={[styles.tableCell, { width: COL.item }]}>Item #</Text>
    <Text style={[styles.tableCell, { width: COL.size }]}>Size</Text>
    <Text style={[styles.tableCell, styles.right, { width: COL.len }]}>Stock Len</Text>
    <Text style={[styles.tableCell, styles.right, { width: COL.qty }]}>Qty</Text>
    <Text style={[styles.tableCell, styles.right, { width: COL.wpf }]}>Wt/Ft</Text>
    <Text style={[styles.tableCell, styles.right, { width: COL.wt }]}>Total Wt (lbs)</Text>
    <Text style={[styles.tableCell, styles.center, { width: COL.units }]}>Units</Text>
    <Text style={[styles.tableCell, styles.right, { width: COL.rate }]}>Rate</Text>
    <Text style={[styles.tableCell, styles.right, { width: COL.cost }]}>Est Cost</Text>
  </View>
);

export const StockListPdf = ({
  logo,
  projectName,
  projectAddress,
  estimatedBy,
  generatedDate,
  rows,
  totalWeight,
  totalCost,
  shortfalls,
  filterNote,
}) => (
  <Document>
    <Page size="LETTER" style={styles.page}>
      <CompanyHeader logo={logo} title="Stock Material Buy List" projectName={projectName} date={generatedDate} />

      {(projectAddress || estimatedBy) ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={{ fontSize: 8, color: COLORS.gray }}>{projectAddress || ''}</Text>
          <Text style={{ fontSize: 8, color: COLORS.gray }}>{estimatedBy ? `Estimator: ${estimatedBy}` : ''}</Text>
        </View>
      ) : null}

      <SectionBar label={`Buy List${filterNote || ''}`} right={`${rows.length} row${rows.length === 1 ? '' : 's'}`} />

      <HeaderRow />
      {rows.map((r, i) => (
        <View key={i} style={[i % 2 === 1 ? styles.tableRowAlt : styles.tableRow, { flexDirection: 'row' }]} wrap={false}>
          <Text style={[styles.tableCell, { width: COL.item }]}>{r.itemNumber}</Text>
          <Text style={[styles.tableCell, styles.bold, { width: COL.size }]}>{r.size}</Text>
          <Text style={[styles.tableCell, styles.right, { width: COL.len }]}>{r.stockLength}'</Text>
          <Text style={[styles.tableCell, styles.right, styles.bold, { width: COL.qty }]}>{r.totalStocks}</Text>
          <Text style={[styles.tableCell, styles.right, { width: COL.wpf }]}>{(r.weightPerFoot || 0).toFixed(2)}</Text>
          <Text style={[styles.tableCell, styles.right, { width: COL.wt }]}>{fmtWt(r.totalWeight)}</Text>
          <Text style={[styles.tableCell, styles.center, { width: COL.units }]}>{r.rate != null ? r.priceBy : (r.priceBy === 'mixed' ? 'mixed' : '—')}</Text>
          <Text style={[styles.tableCell, styles.right, { width: COL.rate }]}>{r.rate != null ? fmtRate4(r.rate) : '—'}</Text>
          <Text style={[styles.tableCell, styles.right, styles.bold, { width: COL.cost }]}>{r.estCost != null ? fmtPrice(r.estCost) : '—'}</Text>
        </View>
      ))}

      {/* Totals */}
      <View style={[styles.tableHeader, { flexDirection: 'row', paddingVertical: 3 }]} wrap={false}>
        <Text style={[styles.tableCell, { width: '52%' }]}>TOTAL</Text>
        <Text style={[styles.tableCell, styles.right, { width: COL.wt }]}>{fmtWt(totalWeight)}</Text>
        <Text style={[styles.tableCell, { width: COL.units }]}></Text>
        <Text style={[styles.tableCell, { width: COL.rate }]}></Text>
        <Text style={[styles.tableCell, styles.right, { width: COL.cost }]}>{fmtPrice(totalCost)}</Text>
      </View>

      <Text style={{ fontSize: 7, color: COLORS.gray, marginTop: 6 }}>
        Est Cost extends the entered supplier rate over each row's purchase quantity ($/LB × total weight, $/CWT × total weight ÷ 100,
        or $/LF × stick length × qty). Rows marked "—" have no uniform rate entered for that size.
      </Text>

      {/* Supplier shortfall (nested groups whose caps can't cover the cuts) */}
      {shortfalls && shortfalls.length > 0 ? (
        <View style={{ marginTop: 12 }} wrap={false}>
          <SectionBar label="Supplier Shortfall — not included in buy list above" />
          {shortfalls.map((s, i) => (
            <View key={i} style={[styles.tableRow, { flexDirection: 'row' }]}>
              <Text style={[styles.tableCell, styles.bold, { width: '20%' }]}>{s.size}</Text>
              <Text style={[styles.tableCell, { width: '80%', color: COLORS.red }]}>
                {s.cuts} cut{s.cuts === 1 ? '' : 's'} / {s.totalFt}' (~{fmtWt(s.lbs)} lbs) exceed the supplier's stick counts — {s.detail}
              </Text>
            </View>
          ))}
          <Text style={{ fontSize: 7, color: COLORS.gray, marginTop: 4 }}>
            Source these from another supplier or raise the stick limits. Shortfall material is carried at exact length in the estimate totals.
          </Text>
        </View>
      ) : null}

      <PageFooter generationDate={generatedDate} />
    </Page>
  </Document>
);
