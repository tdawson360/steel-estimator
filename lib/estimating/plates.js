// Plate data + weight math: gauge/thickness options and the steel plate
// weight-per-foot formula (t × w × 0.2836 lb/in³ × 12 in/ft).

// Plate thickness options with decimal equivalents
const plateThicknesses = [
  { label: '22 ga', value: 0.030 },
  { label: '20 ga', value: 0.036 },
  { label: '18 ga', value: 0.048 },
  { label: '16 ga', value: 0.060 },
  { label: '14 ga', value: 0.075 },
  { label: '12 ga', value: 0.105 },
  { label: '11 ga', value: 0.120 },
  { label: '10 ga', value: 0.135 },
  { label: '7 ga', value: 0.179 },
  { label: '1/8"', value: 0.125 },
  { label: '3/16"', value: 0.1875 },
  { label: '1/4"', value: 0.25 },
  { label: '3/8"', value: 0.375 },
  { label: '1/2"', value: 0.5 },
  { label: '5/8"', value: 0.625 },
  { label: '3/4"', value: 0.75 },
  { label: '7/8"', value: 0.875 },
  { label: '1"', value: 1.0 },
  { label: '1-1/8"', value: 1.125 },
  { label: '1-1/4"', value: 1.25 },
  { label: '1-3/8"', value: 1.375 },
  { label: '1-1/2"', value: 1.5 },
  { label: '1-5/8"', value: 1.625 },
  { label: '1-3/4"', value: 1.75 },
  { label: '1-7/8"', value: 1.875 },
  { label: '2"', value: 2.0 }
];

// Calculate plate weight per foot: thickness(in) × width(in) × 0.2836 lb/in³ × 12 in/ft
const calcPlateWeightPerFoot = (thicknessIn, widthIn) => {
  return thicknessIn * widthIn * 0.2836 * 12;
};

export { plateThicknesses, calcPlateWeightPerFoot };
