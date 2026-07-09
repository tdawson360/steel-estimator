// Mill standard stock lengths per shape category.

// Stock lengths by category — mill standard lengths suppliers actually ship
const standardStockLengths = [20, 25, 30, 35, 40, 45, 50, 55, 60];
const pipeStockLengths = [21, 42];
const angleStockLengths = [20, 40]; // Angle (L) mill lengths
const hssStockLengths = [20, 24, 40, 48]; // HSS Square/Rect mill lengths
const plateStockLengths = [4, 8, 10, 12, 20]; // Plate lengths in feet (from 48", 96", 120", 144" sheets; 20' for bar stock)
const roundBarStockLengths = [12, 20]; // Round bar standard mill lengths

// Get stock lengths based on category
const getStockLengthsForCategory = (category) => {
  if (category === 'Pipe') {
    return pipeStockLengths;
  }
  if (category === 'Angle') {
    return angleStockLengths;
  }
  if (category === 'HSS Square' || category === 'HSS Rect') {
    return hssStockLengths;
  }
  if (category === 'Plate') {
    return plateStockLengths;
  }
  if (category === 'Round Bar') {
    return roundBarStockLengths;
  }
  return standardStockLengths;
};

export {
  standardStockLengths, pipeStockLengths, angleStockLengths, hssStockLengths,
  plateStockLengths, roundBarStockLengths, getStockLengthsForCategory,
};
