import React from 'react';
import { StyleSheet, View, Text, Image, Page } from '@react-pdf/renderer';

export const COLORS = {
  black: '#111827',
  gray: '#6B7280',
  lightGray: '#F3F4F6',
  medGray: '#E5E7EB',
  headerBg: '#374151',
  blue: '#1E40AF',
  lightBlue: '#DBEAFE',
  green: '#166534',
  lightGreen: '#DCFCE7',
  red: '#991B1B',
  lightRed: '#FEE2E2',
};

export const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: COLORS.black,
    paddingTop: 36,
    paddingBottom: 54,
    paddingLeft: 36,
    paddingRight: 36,
  },
  pageLandscape: {
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: COLORS.black,
    paddingTop: 30,
    paddingBottom: 48,
    paddingLeft: 30,
    paddingRight: 30,
  },
  bold: { fontFamily: 'Helvetica-Bold' },
  right: { textAlign: 'right' },
  center: { textAlign: 'center' },
  tableHeader: {
    backgroundColor: COLORS.headerBg,
    color: '#FFFFFF',
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
  },
  tableRow: {
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.medGray,
    borderBottomStyle: 'solid',
    minHeight: 14,
    paddingTop: 2,
    paddingBottom: 2,
  },
  tableRowAlt: {
    backgroundColor: COLORS.lightGray,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.medGray,
    borderBottomStyle: 'solid',
    minHeight: 14,
    paddingTop: 2,
    paddingBottom: 2,
  },
  tableCell: {
    paddingLeft: 4,
    paddingRight: 4,
    fontSize: 8,
  },
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 36,
    right: 36,
    fontSize: 7,
    color: COLORS.gray,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.medGray,
    borderTopStyle: 'solid',
    paddingTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionBar: {
    backgroundColor: COLORS.headerBg,
    color: '#FFFFFF',
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});

export const CompanyHeader = ({ logo, title, projectName, date }) => (
  <View style={{ marginBottom: 12 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 1.5, borderBottomColor: COLORS.black, borderBottomStyle: 'solid', paddingBottom: 6, marginBottom: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {logo ? (
          <Image src={logo} style={{ height: 40, maxWidth: 160, objectFit: 'contain' }} />
        ) : (
          <Text style={[styles.bold, { fontSize: 12 }]}>Berger Iron Works</Text>
        )}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.bold, { fontSize: 13, color: COLORS.headerBg }]}>{title}</Text>
        {projectName ? <Text style={{ fontSize: 8, color: COLORS.gray, marginTop: 2 }}>{projectName}</Text> : null}
        {date ? <Text style={{ fontSize: 8, color: COLORS.gray, marginTop: 1 }}>{date}</Text> : null}
      </View>
    </View>
  </View>
);

export const PageFooter = ({ generationDate }) => (
  <View style={styles.footer} fixed>
    <Text>{generationDate ? `Generated: ${generationDate}` : ''}</Text>
    <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
  </View>
);

export const SectionBar = ({ label, right }) => (
  <View style={styles.sectionBar}>
    <Text style={[styles.bold, { fontSize: 9 }]}>{label}</Text>
    {right ? <Text style={{ fontSize: 8 }}>{right}</Text> : null}
  </View>
);
