import React from 'react';
import { Document, Page, View, Text } from '@react-pdf/renderer';
import { styles, COLORS, CompanyHeader, PageFooter, SectionBar } from './PdfShared';
import { roundCustom } from './pdfUtils';

const fmtWt = (num) => roundCustom(num).toLocaleString();

// Cut ticket / nest record: one section per size group, one row per unique
// cutting pattern, showing which items' cuts land on each purchased stick.
export const CutDetailPdf = ({
  logo,
  projectName,
  projectAddress,
  estimatedBy,
  generatedDate,
  kerfIn,
  endCropIn,
  groups, // [{ size, stickCount, yieldPct, buyLengthFt, netLengthFt, weightPerFoot, rows:[{count, stockLength, partsText, dropFt}], overLengthText, shortfallText }]
}) => (
  <Document>
    <Page size="LETTER" style={styles.page}>
      <CompanyHeader logo={logo} title="Nesting Cut Detail" projectName={projectName} date={generatedDate} />

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ fontSize: 8, color: COLORS.gray }}>{projectAddress || ''}</Text>
        <Text style={{ fontSize: 8, color: COLORS.gray }}>
          {estimatedBy ? `Estimator: ${estimatedBy}   ` : ''}Kerf {kerfIn}" per cut · End crop {endCropIn}" per stick
        </Text>
      </View>

      {groups.map((g, gi) => (
        <View key={gi} style={{ marginBottom: 10 }}>
          <SectionBar
            label={g.size}
            right={`${g.stickCount} stick${g.stickCount === 1 ? '' : 's'} · ${g.buyLengthFt}' purchased · ${fmtWt(g.buyLengthFt * g.weightPerFoot)} lbs · yield ${g.yieldPct}%`}
          />
          {g.rows.map((r, ri) => (
            <View key={ri} style={[ri % 2 === 1 ? styles.tableRowAlt : styles.tableRow, { flexDirection: 'row' }]} wrap={false}>
              <Text style={[styles.tableCell, styles.bold, { width: '14%' }]}>
                {r.count > 1 ? `${r.count} × ` : ''}{r.stockLength}'
              </Text>
              <Text style={[styles.tableCell, { width: '70%' }]}>{r.partsText}</Text>
              <Text style={[styles.tableCell, styles.right, { width: '16%', color: COLORS.gray }]}>drop {r.dropFt}'</Text>
            </View>
          ))}
          {g.overLengthText ? (
            <Text style={{ fontSize: 7.5, color: COLORS.red, marginTop: 3 }}>
              Over-length (splice / mill order): {g.overLengthText}
            </Text>
          ) : null}
          {g.shortfallText ? (
            <Text style={{ fontSize: 7.5, color: COLORS.red, marginTop: 3 }}>
              Supplier shortfall (not on a stick above): {g.shortfallText}
            </Text>
          ) : null}
        </View>
      ))}

      <Text style={{ fontSize: 7, color: COLORS.gray, marginTop: 4 }}>
        Each row is a cutting pattern: the cuts listed come out of one purchased stick ("N ×" rows repeat that pattern on N sticks).
        Drops are before kerf loss recovery; item numbers reference the estimate.
      </Text>

      <PageFooter generationDate={generatedDate} />
    </Page>
  </Document>
);
