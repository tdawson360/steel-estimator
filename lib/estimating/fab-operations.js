// Fabrication operation catalogs and connection-weight data: operation →
// pricing/weight field maps, the operation dropdown taxonomy, and the WF/C
// connection weight fallback tables.

// Maps operation name → pricing field returned by getFabPricingForSize
const OP_PRICING_FIELD = {
  // Cutting (beam-size dependent)
  'Cut- Straight':            'straightCutCost',
  'Cut- Miter':               'miterCutCost',
  'Cut- Double Miter':        'doubleMiterCost',
  'Cut- Single Cope End':     'singleCopeCost',
  'Cut- Double Cope End':     'doubleCopeCost',
  'Cut- Single Cope + Miter': 'singleCopeMiterCost',
  'Cut- Double Cope + Miter': 'doubleCopeMiterCost',
  // Connections (beam-size dependent)
  'WF Connx':                 'connxCost',
  'WF Moment Connx':          'momentConnxCost',
  'C Connx':                  'connxCost',
  'C Moment Connx':           'momentConnxCost',
  // All-in standard connections (priced from the Connx Template via sync;
  // Moment Connx doubles as the CJP price)
  'WF Bolted':                'boltedConnxCost',
  'WF Welded':                'weldedConnxCost',
  'C Bolted':                 'boltedConnxCost',
  'C Welded':                 'weldedConnxCost',
  // Drilling (global rates)
  'Drill Holes':              'drillHolesRate',
  'Drill & C\'sink Holes':    'drillCSinkRate',
  'Drill & Tap Holes':        'drillTapRate',
  // Prep (global rates)
  'Ease':                     'easeRate',
  'Splice':                   'spliceRate',
  '90\'s':                    'ninetyRate',
  'Camber':                   'camberRate',
  'Roll':                     'rollRate',
  'Prep for CJP':             'prepCjpRate',
  'Taper':                    'taperRate',
  // Apply / welding (global rates)
  'Apply- Fillet Weld':        'weldFilletRate',
  'Apply- Bevel/Weld/Grind':   'weldBevelRate',
  'Apply- PJP Weld':           'weldPjpRate',
  'Apply- CJP Weld':           'weldCjpRate',
  'Apply- Preheat/Weld':       'preheatWeldRate',
  'Apply- Preheat/Weld/Grind': 'preheatWeldGrindRate',
};

// Welding ops were renamed to the Apply- family (2026-09-01). Stored rows are
// migrated, but stale payloads/stashes normalize through this map on load.
const LEGACY_OP_RENAMES = {
  'Welding- Fillet':      'Apply- Fillet Weld',
  'Welding- Bevel/Grind': 'Apply- Bevel/Weld/Grind',
  'Welding- PJP':         'Apply- PJP Weld',
  'Welding- CJP':         'Apply- CJP Weld',
};

// Maps connection operation → weight field in pricing result
const OP_WEIGHT_FIELD = {
  'WF Connx':        'connxWeightLbs',
  'WF Moment Connx': 'momentConnxWeightLbs',
  'C Connx':         'connxWeightLbs',
  'C Moment Connx':  'momentConnxWeightLbs',
  'WF Bolted':       'connxWeightLbs',
  'WF Welded':       'connxWeightLbs',
  'C Bolted':        'connxWeightLbs',
  'C Welded':        'connxWeightLbs',
};

// Default unit for each operation type (omitted = 'EA')
const OP_DEFAULT_UNIT = {
  'Taper':                     'LF',   // priced per linear foot of taper cut
  'Apply- Fillet Weld':        'IN',
  'Apply- Bevel/Weld/Grind':   'IN',
  'Apply- PJP Weld':           'IN',
  'Apply- CJP Weld':           'IN',
  'Apply- Preheat/Weld':       'IN',
  'Apply- Preheat/Weld/Grind': 'IN',
};

// Fabrication operations - organized by category
const fabricationOperations = {
  cutting: [
    'Cut- Straight',
    'Cut- Miter',
    'Cut- Double Miter',
    'Cut- Single Cope End',
    'Cut- Single Cope + Miter',
    'Cut- Double Cope End',
    'Cut- Double Cope + Miter',
    'Cut- Profile'
  ],
  drilling: [
    'Drill Holes',
    'Drill & C\'sink Holes',
    'Drill & Tap Holes',
    'Drill Thru Holes'
  ],
  prep: [
    'Ease',
    'Splice',
    '90\'s',
    'Camber',
    'Roll',
    'Prep for CJP',
    'Taper'
  ],
  apply: [
    'Apply- Fillet Weld',
    'Apply- Bevel/Weld/Grind',
    'Apply- PJP Weld',
    'Apply- CJP Weld',
    'Apply- Preheat/Weld',
    'Apply- Preheat/Weld/Grind'
  ],
  coatings: [
    'Prime Paint',
    'Blast & Prime',
    'Finish Paint',
    'TNEMEC',
    'Speciality Coating',
    'Std. Shop Coat',
    'Anodized',
    'Powder Coat',
    'Glass Bead Blast'
  ],
  finishes: [
    '#4 Satin',
    '#8 Mirror',
    'Non-Directional',
    'Speciality Finish'
  ],
  handling: [
    'Handling',
    'Fit up/Assembly',
    'Shop Inspection',
    'Shop Load-out',
    'Hotshot'
  ],
  connections: [
    'WF Bolted',
    'WF Welded',
    'C Bolted',
    'C Welded',
    'WF Connx',
    'C Connx',
    'WF Moment Connx',
    'C Moment Connx',
    'Loose'
  ]
};

// Connection types that carry a weight-based cost (connWeight applies)
// 'Loose' is excluded because it has no associated connection weight
const CONNECTION_WEIGHT_OPS = new Set([
  'WF Connx',
  'C Connx',
  'WF Moment Connx',
  'C Moment Connx',
  'WF Bolted',
  'WF Welded',
  'C Bolted',
  'C Welded',
]);

// Flattened list for dropdowns
const allFabOperations = [
  ...fabricationOperations.cutting,
  ...fabricationOperations.drilling,
  ...fabricationOperations.prep,
  ...fabricationOperations.apply,
  ...fabricationOperations.coatings,
  ...fabricationOperations.finishes,
  ...fabricationOperations.handling,
  ...fabricationOperations.connections
];

// WF Connection Weights (beam size -> connection weight in lbs)
// Data from WF_connection_weights.csv - keys are UPPERCASE for case-insensitive lookup
const wfConnectionWeights = {
  'W44X408': 57, 'W44X368': 57, 'W44X335': 57, 'W44X290': 57, 'W44X262': 57, 'W44X230': 57,
  'W40X655': 57, 'W40X593': 57, 'W40X503': 57, 'W40X431': 57, 'W40X397': 57, 'W40X372': 57,
  'W40X362': 57, 'W40X324': 57, 'W40X297': 57, 'W40X277': 57, 'W40X249': 57, 'W40X215': 57,
  'W40X199': 57, 'W40X392': 57, 'W40X331': 57, 'W40X327': 57, 'W40X294': 57, 'W40X278': 57,
  'W40X264': 57, 'W40X235': 57, 'W40X211': 57, 'W40X183': 57, 'W40X167': 57, 'W40X149': 57,
  'W36X925': 57, 'W36X853': 57, 'W36X802': 57, 'W36X723': 57, 'W36X652': 57, 'W36X529': 57,
  'W36X487': 57, 'W36X441': 57, 'W36X395': 57, 'W36X361': 57, 'W36X330': 57, 'W36X302': 57,
  'W36X282': 57, 'W36X262': 57, 'W36X247': 57, 'W36X231': 57, 'W36X387': 57, 'W36X350': 57,
  'W36X318': 57, 'W36X286': 57, 'W36X256': 57, 'W36X232': 57, 'W36X210': 57, 'W36X194': 57,
  'W36X182': 57, 'W36X170': 57, 'W36X160': 57, 'W36X150': 57, 'W36X135': 57,
  'W33X387': 51, 'W33X354': 51, 'W33X318': 51, 'W33X291': 51, 'W33X263': 51, 'W33X241': 51,
  'W33X221': 51, 'W33X201': 51, 'W33X169': 51, 'W33X152': 51, 'W33X141': 51, 'W33X130': 51, 'W33X118': 51,
  'W30X391': 46, 'W30X357': 46, 'W30X326': 46, 'W30X292': 46, 'W30X261': 46, 'W30X235': 46,
  'W30X211': 46, 'W30X191': 46, 'W30X173': 46, 'W30X148': 46, 'W30X132': 46, 'W30X124': 46,
  'W30X116': 46, 'W30X108': 46, 'W30X99': 46, 'W30X90': 46,
  'W27X539': 40, 'W27X368': 40, 'W27X336': 40, 'W27X307': 40, 'W27X281': 40, 'W27X258': 40,
  'W27X235': 40, 'W27X217': 40, 'W27X194': 40, 'W27X178': 40, 'W27X161': 40, 'W27X146': 40,
  'W27X129': 40, 'W27X114': 40, 'W27X102': 40, 'W27X94': 40, 'W27X84': 40,
  'W24X370': 34, 'W24X335': 34, 'W24X306': 34, 'W24X279': 34, 'W24X250': 34, 'W24X229': 34,
  'W24X207': 34, 'W24X192': 34, 'W24X176': 34, 'W24X162': 34, 'W24X146': 34, 'W24X131': 34,
  'W24X117': 34, 'W24X104': 34, 'W24X103': 34, 'W24X94': 34, 'W24X84': 34, 'W24X76': 34,
  'W24X68': 34, 'W24X62': 34, 'W24X55': 34,
  'W21X275': 28, 'W21X248': 28, 'W21X223': 28, 'W21X201': 28, 'W21X182': 28, 'W21X166': 28,
  'W21X147': 28, 'W21X132': 28, 'W21X122': 28, 'W21X111': 28, 'W21X101': 28, 'W21X93': 28,
  'W21X83': 28, 'W21X73': 28, 'W21X68': 28, 'W21X62': 28, 'W21X55': 28, 'W21X48': 28,
  'W21X57': 28, 'W21X50': 28, 'W21X44': 28,
  'W18X311': 20, 'W18X283': 20, 'W18X258': 20, 'W18X234': 20, 'W18X211': 20, 'W18X192': 20,
  'W18X175': 20, 'W18X158': 20, 'W18X143': 20, 'W18X130': 20, 'W18X119': 20, 'W18X106': 20,
  'W18X97': 20, 'W18X86': 20, 'W18X76': 20, 'W18X71': 20, 'W18X65': 20, 'W18X60': 20,
  'W18X55': 20, 'W18X50': 20, 'W18X46': 20, 'W18X40': 20, 'W18X35': 20,
  'W16X100': 20, 'W16X89': 20, 'W16X77': 20, 'W16X67': 20, 'W16X57': 20, 'W16X50': 20,
  'W16X45': 20, 'W16X40': 20, 'W16X36': 20, 'W16X31': 20, 'W16X26': 20,
  'W14X873': 14, 'W14X808': 14, 'W14X730': 14, 'W14X665': 14, 'W14X605': 14, 'W14X550': 14,
  'W14X500': 14, 'W14X455': 14, 'W14X426': 14, 'W14X398': 14, 'W14X370': 14, 'W14X342': 14,
  'W14X311': 14, 'W14X283': 14, 'W14X257': 14, 'W14X233': 14, 'W14X211': 14, 'W14X193': 14,
  'W14X176': 14, 'W14X159': 14, 'W14X145': 14, 'W14X132': 14, 'W14X120': 14, 'W14X109': 14,
  'W14X99': 14, 'W14X90': 14, 'W14X82': 14, 'W14X74': 14, 'W14X68': 14, 'W14X61': 14,
  'W14X53': 14, 'W14X48': 14, 'W14X43': 14, 'W14X38': 14, 'W14X34': 14, 'W14X30': 14,
  'W14X26': 14, 'W14X22': 14,
  'W12X336': 14, 'W12X305': 14, 'W12X279': 14, 'W12X252': 14, 'W12X230': 14, 'W12X210': 14,
  'W12X190': 14, 'W12X170': 14, 'W12X152': 14, 'W12X136': 14, 'W12X120': 14, 'W12X106': 14,
  'W12X96': 14, 'W12X87': 14, 'W12X79': 14, 'W12X72': 14, 'W12X65': 14, 'W12X58': 14,
  'W12X53': 14, 'W12X50': 14, 'W12X45': 14, 'W12X40': 14, 'W12X35': 14, 'W12X30': 14,
  'W12X26': 14, 'W12X22': 14, 'W12X19': 14, 'W12X16': 14, 'W12X14': 14,
  'W10X112': 13, 'W10X100': 13, 'W10X88': 13, 'W10X77': 13, 'W10X68': 13, 'W10X60': 13,
  'W10X54': 13, 'W10X49': 13, 'W10X45': 13, 'W10X39': 13, 'W10X33': 13, 'W10X30': 13,
  'W10X26': 13, 'W10X22': 13, 'W10X19': 13, 'W10X17': 13, 'W10X15': 13, 'W10X12': 13,
  'W8X67': 13, 'W8X58': 13, 'W8X48': 13, 'W8X40': 13, 'W8X35': 13, 'W8X31': 13,
  'W8X28': 13, 'W8X24': 13, 'W8X21': 13, 'W8X18': 13, 'W8X15': 13, 'W8X13': 13, 'W8X10': 13,
  'W6X25': 7, 'W6X20': 7, 'W6X15': 7, 'W6X16': 7, 'W6X12': 7, 'W6X9': 7, 'W6X8.5': 7,
  'W5X19': 4, 'W5X16': 4,
  'W4X13': 4
};

// C/MC Connection Weights (channel size -> connection weight in lbs)
// Data from C_connection_weights.csv - keys are UPPERCASE for case-insensitive lookup
const cConnectionWeights = {
  'C15X50': 20, 'C15X40': 20, 'C15X33.9': 20,
  'C12X30': 14, 'C12X25': 14, 'C12X20.7': 14,
  'C10X30': 13, 'C10X25': 13, 'C10X20': 13, 'C10X15.3': 13,
  'C9X20': 13, 'C9X15': 13, 'C9X13.4': 13,
  'C8X18.75': 13, 'C8X13.75': 13, 'C8X11.5': 13,
  'C7X14.75': 7, 'C7X12.25': 7, 'C7X9.8': 7,
  'C6X13': 7, 'C6X10.5': 7, 'C6X8.2': 7,
  'C5X9': 4, 'C5X6.7': 4,
  'C4X7.25': 4, 'C4X6.25': 4, 'C4X5.4': 4, 'C4X4.5': 4,
  'C3X6': 4, 'C3X5': 4, 'C3X4.1': 4, 'C3X3.5': 4,
  'MC18X58': 23, 'MC18X51.9': 23, 'MC18X45.8': 23, 'MC18X42.7': 23,
  'MC13X50': 20, 'MC13X40': 20, 'MC13X35': 20, 'MC13X31.8': 20,
  'MC12X50': 14, 'MC12X45': 14, 'MC12X40': 14, 'MC12X35': 14,
  'MC12X31': 14, 'MC12X14.3': 14, 'MC12X10.6': 14,
  'MC10X41.1': 13, 'MC10X33.6': 13, 'MC10X28.5': 13, 'MC10X25': 13,
  'MC10X22': 13, 'MC10X8.4': 13, 'MC10X6.5': 13,
  'MC9X25.4': 13, 'MC9X23.9': 13,
  'MC8X22.8': 13, 'MC8X21.4': 13, 'MC8X20': 13, 'MC8X18.7': 13, 'MC8X8.5': 13,
  'MC7X22.7': 7, 'MC7X19.1': 7,
  'MC6X18': 7, 'MC6X15.3': 7, 'MC6X16.3': 7, 'MC6X15.1': 7, 'MC6X12': 7, 'MC6X7': 7, 'MC6X6.5': 7,
  'MC4X13.8': 4, 'MC3X7.1': 4
};

// Get connection weight for a beam/channel size (case-insensitive lookup)
const getConnectionWeight = (size, category) => {
  if (!size) return 0;
  const upperSize = size.toUpperCase();
  if (category === 'W Shape' && wfConnectionWeights[upperSize]) {
    return wfConnectionWeights[upperSize];
  }
  if ((category === 'Channel' || category === 'MC Channel') && cConnectionWeights[upperSize]) {
    return cConnectionWeights[upperSize];
  }
  return 0;
};

export {
  OP_PRICING_FIELD, OP_WEIGHT_FIELD, OP_DEFAULT_UNIT, LEGACY_OP_RENAMES,
  fabricationOperations, allFabOperations, CONNECTION_WEIGHT_OPS,
  wfConnectionWeights, cConnectionWeights, getConnectionWeight,
};
