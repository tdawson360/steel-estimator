import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { getFabPricingForSize, getCustomOps } from '../lib/fab-pricing';
import { Plus, Trash2, Download, Save, ChevronDown, ChevronRight, X, Upload, AlertCircle, Check, Copy, FileText, ArrowLeft, Calculator, GripVertical } from 'lucide-react';
import CustomerSearchInput from './CustomerSearchInput';

// Company Logo (Base64 encoded)
import COMPANY_LOGO from '../lib/logo.js';

// Complete AISC Steel Database organized by category
const steelDatabase = {
  // W Shapes
  'W44x335': { weight: 335, category: 'W Shape' },
  'W44x290': { weight: 290, category: 'W Shape' },
  'W44x262': { weight: 262, category: 'W Shape' },
  'W44x230': { weight: 230, category: 'W Shape' },
  'W40x593': { weight: 593, category: 'W Shape' },
  'W40x503': { weight: 503, category: 'W Shape' },
  'W40x431': { weight: 431, category: 'W Shape' },
  'W40x397': { weight: 397, category: 'W Shape' },
  'W40x372': { weight: 372, category: 'W Shape' },
  'W40x362': { weight: 362, category: 'W Shape' },
  'W40x324': { weight: 324, category: 'W Shape' },
  'W40x297': { weight: 297, category: 'W Shape' },
  'W40x277': { weight: 277, category: 'W Shape' },
  'W40x249': { weight: 249, category: 'W Shape' },
  'W40x215': { weight: 215, category: 'W Shape' },
  'W40x199': { weight: 199, category: 'W Shape' },
  'W40x183': { weight: 183, category: 'W Shape' },
  'W40x167': { weight: 167, category: 'W Shape' },
  'W40x149': { weight: 149, category: 'W Shape' },
  'W36x800': { weight: 800, category: 'W Shape' },
  'W36x652': { weight: 652, category: 'W Shape' },
  'W36x529': { weight: 529, category: 'W Shape' },
  'W36x487': { weight: 487, category: 'W Shape' },
  'W36x441': { weight: 441, category: 'W Shape' },
  'W36x395': { weight: 395, category: 'W Shape' },
  'W36x361': { weight: 361, category: 'W Shape' },
  'W36x330': { weight: 330, category: 'W Shape' },
  'W36x302': { weight: 302, category: 'W Shape' },
  'W36x282': { weight: 282, category: 'W Shape' },
  'W36x262': { weight: 262, category: 'W Shape' },
  'W36x247': { weight: 247, category: 'W Shape' },
  'W36x231': { weight: 231, category: 'W Shape' },
  'W36x210': { weight: 210, category: 'W Shape' },
  'W36x194': { weight: 194, category: 'W Shape' },
  'W36x182': { weight: 182, category: 'W Shape' },
  'W36x170': { weight: 170, category: 'W Shape' },
  'W36x160': { weight: 160, category: 'W Shape' },
  'W36x150': { weight: 150, category: 'W Shape' },
  'W36x135': { weight: 135, category: 'W Shape' },
  'W33x387': { weight: 387, category: 'W Shape' },
  'W33x354': { weight: 354, category: 'W Shape' },
  'W33x318': { weight: 318, category: 'W Shape' },
  'W33x291': { weight: 291, category: 'W Shape' },
  'W33x263': { weight: 263, category: 'W Shape' },
  'W33x241': { weight: 241, category: 'W Shape' },
  'W33x221': { weight: 221, category: 'W Shape' },
  'W33x201': { weight: 201, category: 'W Shape' },
  'W33x169': { weight: 169, category: 'W Shape' },
  'W33x152': { weight: 152, category: 'W Shape' },
  'W33x141': { weight: 141, category: 'W Shape' },
  'W33x130': { weight: 130, category: 'W Shape' },
  'W33x118': { weight: 118, category: 'W Shape' },
  'W30x391': { weight: 391, category: 'W Shape' },
  'W30x357': { weight: 357, category: 'W Shape' },
  'W30x326': { weight: 326, category: 'W Shape' },
  'W30x292': { weight: 292, category: 'W Shape' },
  'W30x261': { weight: 261, category: 'W Shape' },
  'W30x235': { weight: 235, category: 'W Shape' },
  'W30x211': { weight: 211, category: 'W Shape' },
  'W30x191': { weight: 191, category: 'W Shape' },
  'W30x173': { weight: 173, category: 'W Shape' },
  'W30x148': { weight: 148, category: 'W Shape' },
  'W30x132': { weight: 132, category: 'W Shape' },
  'W30x124': { weight: 124, category: 'W Shape' },
  'W30x116': { weight: 116, category: 'W Shape' },
  'W30x108': { weight: 108, category: 'W Shape' },
  'W30x99': { weight: 99, category: 'W Shape' },
  'W30x90': { weight: 90, category: 'W Shape' },
  'W27x539': { weight: 539, category: 'W Shape' },
  'W27x368': { weight: 368, category: 'W Shape' },
  'W27x336': { weight: 336, category: 'W Shape' },
  'W27x307': { weight: 307, category: 'W Shape' },
  'W27x281': { weight: 281, category: 'W Shape' },
  'W27x258': { weight: 258, category: 'W Shape' },
  'W27x235': { weight: 235, category: 'W Shape' },
  'W27x217': { weight: 217, category: 'W Shape' },
  'W27x194': { weight: 194, category: 'W Shape' },
  'W27x178': { weight: 178, category: 'W Shape' },
  'W27x161': { weight: 161, category: 'W Shape' },
  'W27x146': { weight: 146, category: 'W Shape' },
  'W27x129': { weight: 129, category: 'W Shape' },
  'W27x114': { weight: 114, category: 'W Shape' },
  'W27x102': { weight: 102, category: 'W Shape' },
  'W27x94': { weight: 94, category: 'W Shape' },
  'W27x84': { weight: 84, category: 'W Shape' },
  'W24x370': { weight: 370, category: 'W Shape' },
  'W24x335': { weight: 335, category: 'W Shape' },
  'W24x306': { weight: 306, category: 'W Shape' },
  'W24x279': { weight: 279, category: 'W Shape' },
  'W24x250': { weight: 250, category: 'W Shape' },
  'W24x229': { weight: 229, category: 'W Shape' },
  'W24x207': { weight: 207, category: 'W Shape' },
  'W24x192': { weight: 192, category: 'W Shape' },
  'W24x176': { weight: 176, category: 'W Shape' },
  'W24x162': { weight: 162, category: 'W Shape' },
  'W24x146': { weight: 146, category: 'W Shape' },
  'W24x131': { weight: 131, category: 'W Shape' },
  'W24x117': { weight: 117, category: 'W Shape' },
  'W24x104': { weight: 104, category: 'W Shape' },
  'W24x103': { weight: 103, category: 'W Shape' },
  'W24x94': { weight: 94, category: 'W Shape' },
  'W24x84': { weight: 84, category: 'W Shape' },
  'W24x76': { weight: 76, category: 'W Shape' },
  'W24x68': { weight: 68, category: 'W Shape' },
  'W24x62': { weight: 62, category: 'W Shape' },
  'W24x55': { weight: 55, category: 'W Shape' },
  'W21x201': { weight: 201, category: 'W Shape' },
  'W21x182': { weight: 182, category: 'W Shape' },
  'W21x166': { weight: 166, category: 'W Shape' },
  'W21x147': { weight: 147, category: 'W Shape' },
  'W21x132': { weight: 132, category: 'W Shape' },
  'W21x122': { weight: 122, category: 'W Shape' },
  'W21x111': { weight: 111, category: 'W Shape' },
  'W21x101': { weight: 101, category: 'W Shape' },
  'W21x93': { weight: 93, category: 'W Shape' },
  'W21x83': { weight: 83, category: 'W Shape' },
  'W21x73': { weight: 73, category: 'W Shape' },
  'W21x68': { weight: 68, category: 'W Shape' },
  'W21x62': { weight: 62, category: 'W Shape' },
  'W21x57': { weight: 57, category: 'W Shape' },
  'W21x55': { weight: 55, category: 'W Shape' },
  'W21x50': { weight: 50, category: 'W Shape' },
  'W21x48': { weight: 48, category: 'W Shape' },
  'W21x44': { weight: 44, category: 'W Shape' },
  'W18x311': { weight: 311, category: 'W Shape' },
  'W18x283': { weight: 283, category: 'W Shape' },
  'W18x258': { weight: 258, category: 'W Shape' },
  'W18x234': { weight: 234, category: 'W Shape' },
  'W18x211': { weight: 211, category: 'W Shape' },
  'W18x192': { weight: 192, category: 'W Shape' },
  'W18x175': { weight: 175, category: 'W Shape' },
  'W18x158': { weight: 158, category: 'W Shape' },
  'W18x143': { weight: 143, category: 'W Shape' },
  'W18x130': { weight: 130, category: 'W Shape' },
  'W18x119': { weight: 119, category: 'W Shape' },
  'W18x106': { weight: 106, category: 'W Shape' },
  'W18x97': { weight: 97, category: 'W Shape' },
  'W18x86': { weight: 86, category: 'W Shape' },
  'W18x76': { weight: 76, category: 'W Shape' },
  'W18x71': { weight: 71, category: 'W Shape' },
  'W18x65': { weight: 65, category: 'W Shape' },
  'W18x60': { weight: 60, category: 'W Shape' },
  'W18x55': { weight: 55, category: 'W Shape' },
  'W18x50': { weight: 50, category: 'W Shape' },
  'W18x46': { weight: 46, category: 'W Shape' },
  'W18x40': { weight: 40, category: 'W Shape' },
  'W18x35': { weight: 35, category: 'W Shape' },
  'W16x100': { weight: 100, category: 'W Shape' },
  'W16x89': { weight: 89, category: 'W Shape' },
  'W16x77': { weight: 77, category: 'W Shape' },
  'W16x67': { weight: 67, category: 'W Shape' },
  'W16x57': { weight: 57, category: 'W Shape' },
  'W16x50': { weight: 50, category: 'W Shape' },
  'W16x45': { weight: 45, category: 'W Shape' },
  'W16x40': { weight: 40, category: 'W Shape' },
  'W16x36': { weight: 36, category: 'W Shape' },
  'W16x31': { weight: 31, category: 'W Shape' },
  'W16x26': { weight: 26, category: 'W Shape' },
  'W14x730': { weight: 730, category: 'W Shape' },
  'W14x665': { weight: 665, category: 'W Shape' },
  'W14x605': { weight: 605, category: 'W Shape' },
  'W14x550': { weight: 550, category: 'W Shape' },
  'W14x500': { weight: 500, category: 'W Shape' },
  'W14x455': { weight: 455, category: 'W Shape' },
  'W14x426': { weight: 426, category: 'W Shape' },
  'W14x398': { weight: 398, category: 'W Shape' },
  'W14x370': { weight: 370, category: 'W Shape' },
  'W14x342': { weight: 342, category: 'W Shape' },
  'W14x311': { weight: 311, category: 'W Shape' },
  'W14x283': { weight: 283, category: 'W Shape' },
  'W14x257': { weight: 257, category: 'W Shape' },
  'W14x233': { weight: 233, category: 'W Shape' },
  'W14x211': { weight: 211, category: 'W Shape' },
  'W14x193': { weight: 193, category: 'W Shape' },
  'W14x176': { weight: 176, category: 'W Shape' },
  'W14x159': { weight: 159, category: 'W Shape' },
  'W14x145': { weight: 145, category: 'W Shape' },
  'W14x132': { weight: 132, category: 'W Shape' },
  'W14x120': { weight: 120, category: 'W Shape' },
  'W14x109': { weight: 109, category: 'W Shape' },
  'W14x99': { weight: 99, category: 'W Shape' },
  'W14x90': { weight: 90, category: 'W Shape' },
  'W14x82': { weight: 82, category: 'W Shape' },
  'W14x74': { weight: 74, category: 'W Shape' },
  'W14x68': { weight: 68, category: 'W Shape' },
  'W14x61': { weight: 61, category: 'W Shape' },
  'W14x53': { weight: 53, category: 'W Shape' },
  'W14x48': { weight: 48, category: 'W Shape' },
  'W14x43': { weight: 43, category: 'W Shape' },
  'W14x38': { weight: 38, category: 'W Shape' },
  'W14x34': { weight: 34, category: 'W Shape' },
  'W14x30': { weight: 30, category: 'W Shape' },
  'W14x26': { weight: 26, category: 'W Shape' },
  'W14x22': { weight: 22, category: 'W Shape' },
  'W12x336': { weight: 336, category: 'W Shape' },
  'W12x305': { weight: 305, category: 'W Shape' },
  'W12x279': { weight: 279, category: 'W Shape' },
  'W12x252': { weight: 252, category: 'W Shape' },
  'W12x230': { weight: 230, category: 'W Shape' },
  'W12x210': { weight: 210, category: 'W Shape' },
  'W12x190': { weight: 190, category: 'W Shape' },
  'W12x170': { weight: 170, category: 'W Shape' },
  'W12x152': { weight: 152, category: 'W Shape' },
  'W12x136': { weight: 136, category: 'W Shape' },
  'W12x120': { weight: 120, category: 'W Shape' },
  'W12x106': { weight: 106, category: 'W Shape' },
  'W12x96': { weight: 96, category: 'W Shape' },
  'W12x87': { weight: 87, category: 'W Shape' },
  'W12x79': { weight: 79, category: 'W Shape' },
  'W12x72': { weight: 72, category: 'W Shape' },
  'W12x65': { weight: 65, category: 'W Shape' },
  'W12x58': { weight: 58, category: 'W Shape' },
  'W12x53': { weight: 53, category: 'W Shape' },
  'W12x50': { weight: 50, category: 'W Shape' },
  'W12x45': { weight: 45, category: 'W Shape' },
  'W12x40': { weight: 40, category: 'W Shape' },
  'W12x35': { weight: 35, category: 'W Shape' },
  'W12x30': { weight: 30, category: 'W Shape' },
  'W12x26': { weight: 26, category: 'W Shape' },
  'W12x22': { weight: 22, category: 'W Shape' },
  'W12x19': { weight: 19, category: 'W Shape' },
  'W12x16': { weight: 16, category: 'W Shape' },
  'W12x14': { weight: 14, category: 'W Shape' },
  'W10x112': { weight: 112, category: 'W Shape' },
  'W10x100': { weight: 100, category: 'W Shape' },
  'W10x88': { weight: 88, category: 'W Shape' },
  'W10x77': { weight: 77, category: 'W Shape' },
  'W10x68': { weight: 68, category: 'W Shape' },
  'W10x60': { weight: 60, category: 'W Shape' },
  'W10x54': { weight: 54, category: 'W Shape' },
  'W10x49': { weight: 49, category: 'W Shape' },
  'W10x45': { weight: 45, category: 'W Shape' },
  'W10x39': { weight: 39, category: 'W Shape' },
  'W10x33': { weight: 33, category: 'W Shape' },
  'W10x30': { weight: 30, category: 'W Shape' },
  'W10x26': { weight: 26, category: 'W Shape' },
  'W10x22': { weight: 22, category: 'W Shape' },
  'W10x19': { weight: 19, category: 'W Shape' },
  'W10x17': { weight: 17, category: 'W Shape' },
  'W10x15': { weight: 15, category: 'W Shape' },
  'W10x12': { weight: 12, category: 'W Shape' },
  'W8x67': { weight: 67, category: 'W Shape' },
  'W8x58': { weight: 58, category: 'W Shape' },
  'W8x48': { weight: 48, category: 'W Shape' },
  'W8x40': { weight: 40, category: 'W Shape' },
  'W8x35': { weight: 35, category: 'W Shape' },
  'W8x31': { weight: 31, category: 'W Shape' },
  'W8x28': { weight: 28, category: 'W Shape' },
  'W8x24': { weight: 24, category: 'W Shape' },
  'W8x21': { weight: 21, category: 'W Shape' },
  'W8x18': { weight: 18, category: 'W Shape' },
  'W8x15': { weight: 15, category: 'W Shape' },
  'W8x13': { weight: 13, category: 'W Shape' },
  'W8x10': { weight: 10, category: 'W Shape' },
  'W6x25': { weight: 25, category: 'W Shape' },
  'W6x20': { weight: 20, category: 'W Shape' },
  'W6x16': { weight: 16, category: 'W Shape' },
  'W6x15': { weight: 15, category: 'W Shape' },
  'W6x12': { weight: 12, category: 'W Shape' },
  'W6x9': { weight: 9, category: 'W Shape' },
  'W5x19': { weight: 19, category: 'W Shape' },
  'W5x16': { weight: 16, category: 'W Shape' },
  'W4x13': { weight: 13, category: 'W Shape' },
  // Channels
  'C15x50': { weight: 50, category: 'Channel' },
  'C15x40': { weight: 40, category: 'Channel' },
  'C15x33.9': { weight: 33.9, category: 'Channel' },
  'C12x30': { weight: 30, category: 'Channel' },
  'C12x25': { weight: 25, category: 'Channel' },
  'C12x20.7': { weight: 20.7, category: 'Channel' },
  'C10x30': { weight: 30, category: 'Channel' },
  'C10x25': { weight: 25, category: 'Channel' },
  'C10x20': { weight: 20, category: 'Channel' },
  'C10x15.3': { weight: 15.3, category: 'Channel' },
  'C9x20': { weight: 20, category: 'Channel' },
  'C9x15': { weight: 15, category: 'Channel' },
  'C9x13.4': { weight: 13.4, category: 'Channel' },
  'C8x18.75': { weight: 18.75, category: 'Channel' },
  'C8x13.75': { weight: 13.75, category: 'Channel' },
  'C8x11.5': { weight: 11.5, category: 'Channel' },
  'C7x14.75': { weight: 14.75, category: 'Channel' },
  'C7x12.25': { weight: 12.25, category: 'Channel' },
  'C7x9.8': { weight: 9.8, category: 'Channel' },
  'C6x13': { weight: 13, category: 'Channel' },
  'C6x10.5': { weight: 10.5, category: 'Channel' },
  'C6x8.2': { weight: 8.2, category: 'Channel' },
  'C5x9': { weight: 9, category: 'Channel' },
  'C5x6.7': { weight: 6.7, category: 'Channel' },
  'C4x7.25': { weight: 7.25, category: 'Channel' },
  'C4x5.4': { weight: 5.4, category: 'Channel' },
  'C3x6': { weight: 6, category: 'Channel' },
  'C3x5': { weight: 5, category: 'Channel' },
  'C3x4.1': { weight: 4.1, category: 'Channel' },
  'MC18x58': { weight: 58, category: 'MC Channel' },
  'MC18x51.9': { weight: 51.9, category: 'MC Channel' },
  'MC18x45.8': { weight: 45.8, category: 'MC Channel' },
  'MC18x42.7': { weight: 42.7, category: 'MC Channel' },
  'MC13x50': { weight: 50, category: 'MC Channel' },
  'MC13x40': { weight: 40, category: 'MC Channel' },
  'MC13x35': { weight: 35, category: 'MC Channel' },
  'MC13x31.8': { weight: 31.8, category: 'MC Channel' },
  'MC12x50': { weight: 50, category: 'MC Channel' },
  'MC12x45': { weight: 45, category: 'MC Channel' },
  'MC12x40': { weight: 40, category: 'MC Channel' },
  'MC12x35': { weight: 35, category: 'MC Channel' },
  'MC12x31': { weight: 31, category: 'MC Channel' },
  'MC12x14.3': { weight: 14.3, category: 'MC Channel' },
  'MC12x10.6': { weight: 10.6, category: 'MC Channel' },
  'MC10x41.1': { weight: 41.1, category: 'MC Channel' },
  'MC10x33.6': { weight: 33.6, category: 'MC Channel' },
  'MC10x28.5': { weight: 28.5, category: 'MC Channel' },
  'MC10x25': { weight: 25, category: 'MC Channel' },
  'MC10x22': { weight: 22, category: 'MC Channel' },
  'MC10x8.4': { weight: 8.4, category: 'MC Channel' },
  'MC10x6.5': { weight: 6.5, category: 'MC Channel' },
  'MC9x25.4': { weight: 25.4, category: 'MC Channel' },
  'MC9x23.9': { weight: 23.9, category: 'MC Channel' },
  'MC8x22.8': { weight: 22.8, category: 'MC Channel' },
  'MC8x21.4': { weight: 21.4, category: 'MC Channel' },
  'MC8x20': { weight: 20, category: 'MC Channel' },
  'MC8x18.7': { weight: 18.7, category: 'MC Channel' },
  'MC8x8.5': { weight: 8.5, category: 'MC Channel' },
  'MC7x22.7': { weight: 22.7, category: 'MC Channel' },
  'MC7x19.1': { weight: 19.1, category: 'MC Channel' },
  'MC6x18': { weight: 18, category: 'MC Channel' },
  'MC6x16.3': { weight: 16.3, category: 'MC Channel' },
  'MC6x15.3': { weight: 15.3, category: 'MC Channel' },
  'MC6x15.1': { weight: 15.1, category: 'MC Channel' },
  'MC6x12': { weight: 12, category: 'MC Channel' },
  'MC6x7': { weight: 7, category: 'MC Channel' },
  'MC6x6.5': { weight: 6.5, category: 'MC Channel' },
  'MC4x13.8': { weight: 13.8, category: 'MC Channel' },
  'MC3x7.1': { weight: 7.1, category: 'MC Channel' },
  // Angles - Equal Leg
  'L8x8x1-1/8': { weight: 56.9, category: 'Angle' },
  'L8x8x1': { weight: 51.0, category: 'Angle' },
  'L8x8x7/8': { weight: 45.0, category: 'Angle' },
  'L8x8x3/4': { weight: 38.9, category: 'Angle' },
  'L8x8x5/8': { weight: 32.7, category: 'Angle' },
  'L8x8x1/2': { weight: 26.4, category: 'Angle' },
  'L6x6x1': { weight: 37.4, category: 'Angle' },
  'L6x6x7/8': { weight: 33.1, category: 'Angle' },
  'L6x6x3/4': { weight: 28.7, category: 'Angle' },
  'L6x6x5/8': { weight: 24.2, category: 'Angle' },
  'L6x6x1/2': { weight: 19.6, category: 'Angle' },
  'L6x6x3/8': { weight: 14.9, category: 'Angle' },
  'L5x5x7/8': { weight: 27.2, category: 'Angle' },
  'L5x5x3/4': { weight: 23.6, category: 'Angle' },
  'L5x5x5/8': { weight: 20.0, category: 'Angle' },
  'L5x5x1/2': { weight: 16.2, category: 'Angle' },
  'L5x5x3/8': { weight: 12.3, category: 'Angle' },
  'L4x4x3/4': { weight: 18.5, category: 'Angle' },
  'L4x4x5/8': { weight: 15.7, category: 'Angle' },
  'L4x4x1/2': { weight: 12.8, category: 'Angle' },
  'L4x4x3/8': { weight: 9.8, category: 'Angle' },
  'L4x4x5/16': { weight: 8.2, category: 'Angle' },
  'L4x4x1/4': { weight: 6.6, category: 'Angle' },
  'L3-1/2x3-1/2x1/2': { weight: 11.1, category: 'Angle' },
  'L3-1/2x3-1/2x3/8': { weight: 8.5, category: 'Angle' },
  'L3-1/2x3-1/2x5/16': { weight: 7.2, category: 'Angle' },
  'L3-1/2x3-1/2x1/4': { weight: 5.8, category: 'Angle' },
  'L3x3x1/2': { weight: 9.4, category: 'Angle' },
  'L3x3x3/8': { weight: 7.2, category: 'Angle' },
  'L3x3x5/16': { weight: 6.1, category: 'Angle' },
  'L3x3x1/4': { weight: 4.9, category: 'Angle' },
  'L3x3x3/16': { weight: 3.71, category: 'Angle' },
  'L2-1/2x2-1/2x1/2': { weight: 7.7, category: 'Angle' },
  'L2-1/2x2-1/2x3/8': { weight: 5.9, category: 'Angle' },
  'L2-1/2x2-1/2x5/16': { weight: 5.0, category: 'Angle' },
  'L2-1/2x2-1/2x1/4': { weight: 4.1, category: 'Angle' },
  'L2x2x3/8': { weight: 4.7, category: 'Angle' },
  'L2x2x5/16': { weight: 3.92, category: 'Angle' },
  'L2x2x1/4': { weight: 3.19, category: 'Angle' },
  'L2x2x3/16': { weight: 2.44, category: 'Angle' },
  'L2x2x1/8': { weight: 1.65, category: 'Angle' },
  // Angles - Unequal Leg
  'L8x6x1': { weight: 44.2, category: 'Angle' },
  'L8x6x7/8': { weight: 39.1, category: 'Angle' },
  'L8x6x3/4': { weight: 33.8, category: 'Angle' },
  'L8x6x5/8': { weight: 28.5, category: 'Angle' },
  'L8x6x1/2': { weight: 23.0, category: 'Angle' },
  'L8x4x1': { weight: 37.4, category: 'Angle' },
  'L8x4x7/8': { weight: 33.1, category: 'Angle' },
  'L8x4x3/4': { weight: 28.7, category: 'Angle' },
  'L8x4x5/8': { weight: 24.2, category: 'Angle' },
  'L8x4x1/2': { weight: 19.6, category: 'Angle' },
  'L7x4x3/4': { weight: 26.2, category: 'Angle' },
  'L7x4x5/8': { weight: 22.1, category: 'Angle' },
  'L7x4x1/2': { weight: 17.9, category: 'Angle' },
  'L7x4x3/8': { weight: 13.6, category: 'Angle' },
  'L6x4x3/4': { weight: 23.6, category: 'Angle' },
  'L6x4x5/8': { weight: 20.0, category: 'Angle' },
  'L6x4x1/2': { weight: 16.2, category: 'Angle' },
  'L6x4x3/8': { weight: 12.3, category: 'Angle' },
  'L6x4x5/16': { weight: 10.3, category: 'Angle' },
  'L6x3-1/2x1/2': { weight: 15.3, category: 'Angle' },
  'L6x3-1/2x3/8': { weight: 11.7, category: 'Angle' },
  'L6x3-1/2x5/16': { weight: 9.8, category: 'Angle' },
  'L5x3-1/2x1/2': { weight: 13.6, category: 'Angle' },
  'L5x3-1/2x3/8': { weight: 10.4, category: 'Angle' },
  'L5x3-1/2x5/16': { weight: 8.7, category: 'Angle' },
  'L5x3-1/2x1/4': { weight: 7.0, category: 'Angle' },
  'L5x3x1/2': { weight: 12.8, category: 'Angle' },
  'L5x3x3/8': { weight: 9.8, category: 'Angle' },
  'L5x3x5/16': { weight: 8.2, category: 'Angle' },
  'L5x3x1/4': { weight: 6.6, category: 'Angle' },
  'L4x3-1/2x1/2': { weight: 11.9, category: 'Angle' },
  'L4x3-1/2x3/8': { weight: 9.1, category: 'Angle' },
  'L4x3-1/2x5/16': { weight: 7.7, category: 'Angle' },
  'L4x3-1/2x1/4': { weight: 6.2, category: 'Angle' },
  'L4x3x1/2': { weight: 11.1, category: 'Angle' },
  'L4x3x3/8': { weight: 8.5, category: 'Angle' },
  'L4x3x5/16': { weight: 7.2, category: 'Angle' },
  'L4x3x1/4': { weight: 5.8, category: 'Angle' },
  'L3-1/2x3x1/2': { weight: 10.2, category: 'Angle' },
  'L3-1/2x3x3/8': { weight: 7.9, category: 'Angle' },
  'L3-1/2x3x5/16': { weight: 6.6, category: 'Angle' },
  'L3-1/2x3x1/4': { weight: 5.4, category: 'Angle' },
  'L3x2-1/2x1/2': { weight: 8.5, category: 'Angle' },
  'L3x2-1/2x3/8': { weight: 6.6, category: 'Angle' },
  'L3x2-1/2x5/16': { weight: 5.6, category: 'Angle' },
  'L3x2-1/2x1/4': { weight: 4.5, category: 'Angle' },
  'L3x2x1/2': { weight: 7.7, category: 'Angle' },
  'L3x2x3/8': { weight: 5.9, category: 'Angle' },
  'L3x2x5/16': { weight: 5.0, category: 'Angle' },
  'L3x2x1/4': { weight: 4.1, category: 'Angle' },
  'L2-1/2x2x3/8': { weight: 5.3, category: 'Angle' },
  'L2-1/2x2x5/16': { weight: 4.5, category: 'Angle' },
  'L2-1/2x2x1/4': { weight: 3.62, category: 'Angle' },
  // HSS Square
  'HSS20x20x5/8': { weight: 127.37, category: 'HSS Square' },
  'HSS20x20x1/2': { weight: 103.30, category: 'HSS Square' },
  'HSS20x20x3/8': { weight: 78.52, category: 'HSS Square' },
  'HSS18x18x5/8': { weight: 114.23, category: 'HSS Square' },
  'HSS18x18x1/2': { weight: 93.34, category: 'HSS Square' },
  'HSS18x18x3/8': { weight: 71.07, category: 'HSS Square' },
  'HSS16x16x5/8': { weight: 101.09, category: 'HSS Square' },
  'HSS16x16x1/2': { weight: 82.77, category: 'HSS Square' },
  'HSS16x16x3/8': { weight: 63.10, category: 'HSS Square' },
  'HSS16x16x5/16': { weight: 52.91, category: 'HSS Square' },
  'HSS14x14x5/8': { weight: 87.95, category: 'HSS Square' },
  'HSS14x14x1/2': { weight: 72.10, category: 'HSS Square' },
  'HSS14x14x3/8': { weight: 55.15, category: 'HSS Square' },
  'HSS14x14x5/16': { weight: 46.30, category: 'HSS Square' },
  'HSS12x12x5/8': { weight: 74.81, category: 'HSS Square' },
  'HSS12x12x1/2': { weight: 61.43, category: 'HSS Square' },
  'HSS12x12x3/8': { weight: 47.14, category: 'HSS Square' },
  'HSS12x12x5/16': { weight: 39.68, category: 'HSS Square' },
  'HSS12x12x1/4': { weight: 32.03, category: 'HSS Square' },
  'HSS10x10x5/8': { weight: 61.67, category: 'HSS Square' },
  'HSS10x10x1/2': { weight: 50.77, category: 'HSS Square' },
  'HSS10x10x3/8': { weight: 39.18, category: 'HSS Square' },
  'HSS10x10x5/16': { weight: 33.05, category: 'HSS Square' },
  'HSS10x10x1/4': { weight: 26.76, category: 'HSS Square' },
  'HSS8x8x5/8': { weight: 48.53, category: 'HSS Square' },
  'HSS8x8x1/2': { weight: 40.09, category: 'HSS Square' },
  'HSS8x8x3/8': { weight: 31.15, category: 'HSS Square' },
  'HSS8x8x5/16': { weight: 26.41, category: 'HSS Square' },
  'HSS8x8x1/4': { weight: 21.46, category: 'HSS Square' },
  'HSS8x8x3/16': { weight: 16.35, category: 'HSS Square' },
  'HSS6x6x5/8': { weight: 35.39, category: 'HSS Square' },
  'HSS6x6x1/2': { weight: 29.41, category: 'HSS Square' },
  'HSS6x6x3/8': { weight: 23.02, category: 'HSS Square' },
  'HSS6x6x5/16': { weight: 19.60, category: 'HSS Square' },
  'HSS6x6x1/4': { weight: 16.02, category: 'HSS Square' },
  'HSS6x6x3/16': { weight: 12.28, category: 'HSS Square' },
  'HSS5x5x1/2': { weight: 21.40, category: 'HSS Square' },
  'HSS5x5x3/8': { weight: 16.89, category: 'HSS Square' },
  'HSS5x5x5/16': { weight: 14.42, category: 'HSS Square' },
  'HSS5x5x1/4': { weight: 11.85, category: 'HSS Square' },
  'HSS5x5x3/16': { weight: 9.12, category: 'HSS Square' },
  'HSS4x4x1/2': { weight: 16.06, category: 'HSS Square' },
  'HSS4x4x3/8': { weight: 12.76, category: 'HSS Square' },
  'HSS4x4x5/16': { weight: 10.96, category: 'HSS Square' },
  'HSS4x4x1/4': { weight: 9.06, category: 'HSS Square' },
  'HSS4x4x3/16': { weight: 7.03, category: 'HSS Square' },
  'HSS3-1/2x3-1/2x3/8': { weight: 10.70, category: 'HSS Square' },
  'HSS3-1/2x3-1/2x5/16': { weight: 9.23, category: 'HSS Square' },
  'HSS3-1/2x3-1/2x1/4': { weight: 7.67, category: 'HSS Square' },
  'HSS3-1/2x3-1/2x3/16': { weight: 5.97, category: 'HSS Square' },
  'HSS3x3x3/8': { weight: 8.63, category: 'HSS Square' },
  'HSS3x3x5/16': { weight: 7.49, category: 'HSS Square' },
  'HSS3x3x1/4': { weight: 6.26, category: 'HSS Square' },
  'HSS3x3x3/16': { weight: 4.91, category: 'HSS Square' },
  'HSS2-1/2x2-1/2x1/4': { weight: 4.84, category: 'HSS Square' },
  'HSS2-1/2x2-1/2x3/16': { weight: 3.82, category: 'HSS Square' },
  'HSS2x2x1/4': { weight: 3.42, category: 'HSS Square' },
  'HSS2x2x3/16': { weight: 2.72, category: 'HSS Square' },
  'HSS2x2x1/8': { weight: 1.97, category: 'HSS Square' },
  // HSS Rectangular
  'HSS20x12x5/8': { weight: 101.09, category: 'HSS Rect' },
  'HSS20x12x1/2': { weight: 82.77, category: 'HSS Rect' },
  'HSS20x12x3/8': { weight: 63.10, category: 'HSS Rect' },
  'HSS20x8x5/8': { weight: 87.95, category: 'HSS Rect' },
  'HSS20x8x1/2': { weight: 72.10, category: 'HSS Rect' },
  'HSS20x8x3/8': { weight: 55.15, category: 'HSS Rect' },
  'HSS16x12x5/8': { weight: 87.95, category: 'HSS Rect' },
  'HSS16x12x1/2': { weight: 72.10, category: 'HSS Rect' },
  'HSS16x12x3/8': { weight: 55.15, category: 'HSS Rect' },
  'HSS16x8x5/8': { weight: 74.81, category: 'HSS Rect' },
  'HSS16x8x1/2': { weight: 61.43, category: 'HSS Rect' },
  'HSS16x8x3/8': { weight: 47.14, category: 'HSS Rect' },
  'HSS16x8x1/4': { weight: 32.03, category: 'HSS Rect' },
  'HSS14x10x1/2': { weight: 61.43, category: 'HSS Rect' },
  'HSS14x10x3/8': { weight: 47.14, category: 'HSS Rect' },
  'HSS14x10x1/4': { weight: 32.03, category: 'HSS Rect' },
  'HSS14x6x1/2': { weight: 50.77, category: 'HSS Rect' },
  'HSS14x6x3/8': { weight: 39.18, category: 'HSS Rect' },
  'HSS14x6x1/4': { weight: 26.76, category: 'HSS Rect' },
  'HSS12x8x1/2': { weight: 50.77, category: 'HSS Rect' },
  'HSS12x8x3/8': { weight: 39.18, category: 'HSS Rect' },
  'HSS12x8x1/4': { weight: 26.76, category: 'HSS Rect' },
  'HSS12x6x1/2': { weight: 45.43, category: 'HSS Rect' },
  'HSS12x6x3/8': { weight: 35.21, category: 'HSS Rect' },
  'HSS12x6x1/4': { weight: 24.12, category: 'HSS Rect' },
  'HSS12x4x1/2': { weight: 40.09, category: 'HSS Rect' },
  'HSS12x4x3/8': { weight: 31.15, category: 'HSS Rect' },
  'HSS12x4x1/4': { weight: 21.46, category: 'HSS Rect' },
  'HSS10x8x1/2': { weight: 45.43, category: 'HSS Rect' },
  'HSS10x8x3/8': { weight: 35.21, category: 'HSS Rect' },
  'HSS10x8x1/4': { weight: 24.12, category: 'HSS Rect' },
  'HSS10x6x1/2': { weight: 40.09, category: 'HSS Rect' },
  'HSS10x6x3/8': { weight: 31.15, category: 'HSS Rect' },
  'HSS10x6x1/4': { weight: 21.46, category: 'HSS Rect' },
  'HSS10x4x1/2': { weight: 34.75, category: 'HSS Rect' },
  'HSS10x4x3/8': { weight: 27.08, category: 'HSS Rect' },
  'HSS10x4x1/4': { weight: 18.75, category: 'HSS Rect' },
  'HSS8x6x1/2': { weight: 34.75, category: 'HSS Rect' },
  'HSS8x6x3/8': { weight: 27.08, category: 'HSS Rect' },
  'HSS8x6x1/4': { weight: 18.75, category: 'HSS Rect' },
  'HSS8x4x1/2': { weight: 29.41, category: 'HSS Rect' },
  'HSS8x4x3/8': { weight: 23.02, category: 'HSS Rect' },
  'HSS8x4x1/4': { weight: 16.02, category: 'HSS Rect' },
  'HSS8x4x3/16': { weight: 12.28, category: 'HSS Rect' },
  'HSS8x3x3/8': { weight: 20.99, category: 'HSS Rect' },
  'HSS8x3x1/4': { weight: 14.66, category: 'HSS Rect' },
  'HSS8x2x3/8': { weight: 22.37, category: 'HSS Rect' },
  'HSS8x2x5/16': { weight: 19.08, category: 'HSS Rect' },
  'HSS8x2x1/4': { weight: 15.62, category: 'HSS Rect' },
  'HSS8x2x3/16': { weight: 11.97, category: 'HSS Rect' },
  'HSS8x2x1/8': { weight: 8.16, category: 'HSS Rect' },
  'HSS6x4x3/8': { weight: 18.93, category: 'HSS Rect' },
  'HSS6x4x1/4': { weight: 13.29, category: 'HSS Rect' },
  'HSS6x4x3/16': { weight: 10.24, category: 'HSS Rect' },
  'HSS6x3x3/8': { weight: 16.89, category: 'HSS Rect' },
  'HSS6x3x1/4': { weight: 11.85, category: 'HSS Rect' },
  'HSS6x3x3/16': { weight: 9.12, category: 'HSS Rect' },
  'HSS6x2x3/8': { weight: 17.27, category: 'HSS Rect' },
  'HSS6x2x5/16': { weight: 14.83, category: 'HSS Rect' },
  'HSS6x2x1/4': { weight: 12.21, category: 'HSS Rect' },
  'HSS6x2x3/16': { weight: 9.42, category: 'HSS Rect' },
  'HSS6x2x1/8': { weight: 6.46, category: 'HSS Rect' },
  'HSS5x4x3/8': { weight: 16.89, category: 'HSS Rect' },
  'HSS5x4x1/4': { weight: 11.85, category: 'HSS Rect' },
  'HSS5x4x3/16': { weight: 9.12, category: 'HSS Rect' },
  'HSS5x3x3/8': { weight: 14.83, category: 'HSS Rect' },
  'HSS5x3x1/4': { weight: 10.46, category: 'HSS Rect' },
  'HSS5x3x3/16': { weight: 8.08, category: 'HSS Rect' },
  'HSS5x2x1/4': { weight: 9.06, category: 'HSS Rect' },
  'HSS5x2x3/16': { weight: 7.03, category: 'HSS Rect' },
  'HSS4x3x3/8': { weight: 12.76, category: 'HSS Rect' },
  'HSS4x3x1/4': { weight: 9.06, category: 'HSS Rect' },
  'HSS4x3x3/16': { weight: 7.03, category: 'HSS Rect' },
  'HSS4x2x1/4': { weight: 7.67, category: 'HSS Rect' },
  'HSS4x2x3/16': { weight: 5.97, category: 'HSS Rect' },
  'HSS3x2x1/4': { weight: 4.84, category: 'HSS Rect' },
  'HSS3x2x3/16': { weight: 3.82, category: 'HSS Rect' },
  // Pipe
  'PIPE 12 STD': { weight: 49.56, category: 'Pipe' },
  'PIPE 10 STD': { weight: 40.48, category: 'Pipe' },
  'PIPE 8 STD': { weight: 28.55, category: 'Pipe' },
  'PIPE 6 STD': { weight: 18.97, category: 'Pipe' },
  'PIPE 5 STD': { weight: 14.62, category: 'Pipe' },
  'PIPE 4 STD': { weight: 10.79, category: 'Pipe' },
  'PIPE 3-1/2 STD': { weight: 9.11, category: 'Pipe' },
  'PIPE 3 STD': { weight: 7.58, category: 'Pipe' },
  'PIPE 2-1/2 STD': { weight: 5.79, category: 'Pipe' },
  'PIPE 2 STD': { weight: 3.65, category: 'Pipe' },
  'PIPE 1-1/2 STD': { weight: 2.72, category: 'Pipe' },
  'PIPE 1-1/4 STD': { weight: 2.27, category: 'Pipe' },
  'PIPE 1 STD': { weight: 1.68, category: 'Pipe' },
  'PIPE 12 XS': { weight: 65.41, category: 'Pipe' },
  'PIPE 10 XS': { weight: 54.74, category: 'Pipe' },
  'PIPE 8 XS': { weight: 43.39, category: 'Pipe' },
  'PIPE 6 XS': { weight: 28.57, category: 'Pipe' },
  'PIPE 5 XS': { weight: 20.78, category: 'Pipe' },
  'PIPE 4 XS': { weight: 14.98, category: 'Pipe' },
  'PIPE 3-1/2 XS': { weight: 12.50, category: 'Pipe' },
  'PIPE 3 XS': { weight: 10.25, category: 'Pipe' },
  'PIPE 2-1/2 XS': { weight: 7.66, category: 'Pipe' },
  'PIPE 2 XS': { weight: 5.02, category: 'Pipe' },
  'PIPE 1-1/2 XS': { weight: 3.63, category: 'Pipe' },
  'PIPE 1-1/4 XS': { weight: 3.00, category: 'Pipe' },
  'PIPE 1 XS': { weight: 2.17, category: 'Pipe' },
  // Round Bar (weight = 2.6729 × d²  lbs/ft)
  'RD 1/4': { weight: 0.17, category: 'Round Bar' },
  'RD 3/8': { weight: 0.38, category: 'Round Bar' },
  'RD 1/2': { weight: 0.67, category: 'Round Bar' },
  'RD 5/8': { weight: 1.04, category: 'Round Bar' },
  'RD 3/4': { weight: 1.50, category: 'Round Bar' },
  'RD 7/8': { weight: 2.04, category: 'Round Bar' },
  'RD 1': { weight: 2.67, category: 'Round Bar' },
  'RD 1-1/8': { weight: 3.38, category: 'Round Bar' },
  'RD 1-1/4': { weight: 4.17, category: 'Round Bar' },
  'RD 1-3/8': { weight: 5.05, category: 'Round Bar' },
  'RD 1-1/2': { weight: 6.01, category: 'Round Bar' },
  'RD 1-3/4': { weight: 8.18, category: 'Round Bar' },
  'RD 2': { weight: 10.68, category: 'Round Bar' },
  'RD 2-1/4': { weight: 13.52, category: 'Round Bar' },
  'RD 2-1/2': { weight: 16.69, category: 'Round Bar' },
  'RD 2-3/4': { weight: 20.22, category: 'Round Bar' },
  'RD 3': { weight: 24.03, category: 'Round Bar' },
  'RD 3-1/2': { weight: 32.71, category: 'Round Bar' },
  'RD 4': { weight: 42.69, category: 'Round Bar' },
  // WT Shapes
  'WT18x150': { weight: 150, category: 'WT Shape' },
  'WT18x130': { weight: 130, category: 'WT Shape' },
  'WT18x116': { weight: 116, category: 'WT Shape' },
  'WT18x105': { weight: 105, category: 'WT Shape' },
  'WT15x74': { weight: 74, category: 'WT Shape' },
  'WT15x66': { weight: 66, category: 'WT Shape' },
  'WT15x58': { weight: 58, category: 'WT Shape' },
  'WT12x52': { weight: 52, category: 'WT Shape' },
  'WT12x47': { weight: 47, category: 'WT Shape' },
  'WT12x42': { weight: 42, category: 'WT Shape' },
  'WT12x38': { weight: 38, category: 'WT Shape' },
  'WT12x34': { weight: 34, category: 'WT Shape' },
  'WT9x53': { weight: 53, category: 'WT Shape' },
  'WT9x43': { weight: 43, category: 'WT Shape' },
  'WT9x38': { weight: 38, category: 'WT Shape' },
  'WT9x30': { weight: 30, category: 'WT Shape' },
  'WT9x25': { weight: 25, category: 'WT Shape' },
  'WT9x20': { weight: 20, category: 'WT Shape' },
  'WT7x60': { weight: 60, category: 'WT Shape' },
  'WT7x45': { weight: 45, category: 'WT Shape' },
  'WT7x37': { weight: 37, category: 'WT Shape' },
  'WT7x30.5': { weight: 30.5, category: 'WT Shape' },
  'WT7x24': { weight: 24, category: 'WT Shape' },
  'WT7x19': { weight: 19, category: 'WT Shape' },
  'WT7x15': { weight: 15, category: 'WT Shape' },
  'WT7x13': { weight: 13, category: 'WT Shape' },
  'WT7x11': { weight: 11, category: 'WT Shape' },
  'WT6x48': { weight: 48, category: 'WT Shape' },
  'WT6x39.5': { weight: 39.5, category: 'WT Shape' },
  'WT6x32.5': { weight: 32.5, category: 'WT Shape' },
  'WT6x26.5': { weight: 26.5, category: 'WT Shape' },
  'WT6x22.5': { weight: 22.5, category: 'WT Shape' },
  'WT6x17.5': { weight: 17.5, category: 'WT Shape' },
  'WT6x15': { weight: 15, category: 'WT Shape' },
  'WT6x13': { weight: 13, category: 'WT Shape' },
  'WT6x9.5': { weight: 9.5, category: 'WT Shape' },
  'WT6x7': { weight: 7, category: 'WT Shape' },
  'WT5x44': { weight: 44, category: 'WT Shape' },
  'WT5x34': { weight: 34, category: 'WT Shape' },
  'WT5x27': { weight: 27, category: 'WT Shape' },
  'WT5x22.5': { weight: 22.5, category: 'WT Shape' },
  'WT5x16.5': { weight: 16.5, category: 'WT Shape' },
  'WT5x13': { weight: 13, category: 'WT Shape' },
  'WT5x9.5': { weight: 9.5, category: 'WT Shape' },
  'WT5x7.5': { weight: 7.5, category: 'WT Shape' },
  'WT5x6': { weight: 6, category: 'WT Shape' },
  'WT4x24': { weight: 24, category: 'WT Shape' },
  'WT4x17.5': { weight: 17.5, category: 'WT Shape' },
  'WT4x14': { weight: 14, category: 'WT Shape' },
  'WT4x12': { weight: 12, category: 'WT Shape' },
  'WT4x9': { weight: 9, category: 'WT Shape' },
  'WT4x7.5': { weight: 7.5, category: 'WT Shape' },
  'WT4x5': { weight: 5, category: 'WT Shape' },
  'WT3x12.5': { weight: 12.5, category: 'WT Shape' },
  'WT3x10': { weight: 10, category: 'WT Shape' },
  'WT3x7.5': { weight: 7.5, category: 'WT Shape' },
  'WT3x6': { weight: 6, category: 'WT Shape' },
  'WT3x4.5': { weight: 4.5, category: 'WT Shape' },
  // Flats - 198 sizes from FLATS.CSV (FL THKxW format)
  'FL 1/8x3/8': { weight: 0.16, category: 'Flats' },
  'FL 1/8x1/2': { weight: 0.21, category: 'Flats' },
  'FL 1/8x5/8': { weight: 0.27, category: 'Flats' },
  'FL 1/8x3/4': { weight: 0.32, category: 'Flats' },
  'FL 1/8x7/8': { weight: 0.37, category: 'Flats' },
  'FL 1/8x1': { weight: 0.43, category: 'Flats' },
  'FL 1/8x1-1/8': { weight: 0.48, category: 'Flats' },
  'FL 1/8x1-1/4': { weight: 0.53, category: 'Flats' },
  'FL 1/8x1-1/2': { weight: 0.64, category: 'Flats' },
  'FL 1/8x1-3/4': { weight: 0.74, category: 'Flats' },
  'FL 1/8x2': { weight: 0.85, category: 'Flats' },
  'FL 1/8x2-1/4': { weight: 0.96, category: 'Flats' },
  'FL 1/8x2-1/2': { weight: 1.06, category: 'Flats' },
  'FL 1/8x2-3/4': { weight: 1.17, category: 'Flats' },
  'FL 1/8x3': { weight: 1.28, category: 'Flats' },
  'FL 1/8x3-1/2': { weight: 1.49, category: 'Flats' },
  'FL 1/8x4': { weight: 1.70, category: 'Flats' },
  'FL 1/8x4-1/2': { weight: 1.91, category: 'Flats' },
  'FL 1/8x5': { weight: 2.13, category: 'Flats' },
  'FL 1/8x6': { weight: 2.55, category: 'Flats' },
  'FL 1/8x7': { weight: 2.98, category: 'Flats' },
  'FL 1/8x8': { weight: 3.40, category: 'Flats' },
  'FL 3/16x3/8': { weight: 0.24, category: 'Flats' },
  'FL 3/16x1/2': { weight: 0.32, category: 'Flats' },
  'FL 3/16x5/8': { weight: 0.40, category: 'Flats' },
  'FL 3/16x3/4': { weight: 0.48, category: 'Flats' },
  'FL 3/16x7/8': { weight: 0.56, category: 'Flats' },
  'FL 3/16x1': { weight: 0.64, category: 'Flats' },
  'FL 3/16x1-1/8': { weight: 0.72, category: 'Flats' },
  'FL 3/16x1-1/4': { weight: 0.80, category: 'Flats' },
  'FL 3/16x1-1/2': { weight: 0.96, category: 'Flats' },
  'FL 3/16x1-3/4': { weight: 1.12, category: 'Flats' },
  'FL 3/16x2': { weight: 1.28, category: 'Flats' },
  'FL 3/16x2-1/4': { weight: 1.43, category: 'Flats' },
  'FL 3/16x2-1/2': { weight: 1.59, category: 'Flats' },
  'FL 3/16x2-3/4': { weight: 1.75, category: 'Flats' },
  'FL 3/16x3': { weight: 1.91, category: 'Flats' },
  'FL 3/16x3-1/2': { weight: 2.23, category: 'Flats' },
  'FL 3/16x4': { weight: 2.55, category: 'Flats' },
  'FL 3/16x4-1/2': { weight: 2.87, category: 'Flats' },
  'FL 3/16x5': { weight: 3.19, category: 'Flats' },
  'FL 3/16x6': { weight: 3.83, category: 'Flats' },
  'FL 3/16x7': { weight: 4.46, category: 'Flats' },
  'FL 3/16x8': { weight: 5.10, category: 'Flats' },
  'FL 3/16x9': { weight: 5.74, category: 'Flats' },
  'FL 3/16x10': { weight: 6.38, category: 'Flats' },
  'FL 3/16x11': { weight: 7.01, category: 'Flats' },
  'FL 3/16x12': { weight: 7.65, category: 'Flats' },
  'FL 1/4x3/8': { weight: 0.32, category: 'Flats' },
  'FL 1/4x1/2': { weight: 0.43, category: 'Flats' },
  'FL 1/4x5/8': { weight: 0.53, category: 'Flats' },
  'FL 1/4x3/4': { weight: 0.64, category: 'Flats' },
  'FL 1/4x7/8': { weight: 0.74, category: 'Flats' },
  'FL 1/4x1': { weight: 0.85, category: 'Flats' },
  'FL 1/4x1-1/8': { weight: 0.96, category: 'Flats' },
  'FL 1/4x1-1/4': { weight: 1.06, category: 'Flats' },
  'FL 1/4x1-1/2': { weight: 1.28, category: 'Flats' },
  'FL 1/4x1-3/4': { weight: 1.49, category: 'Flats' },
  'FL 1/4x2': { weight: 1.70, category: 'Flats' },
  'FL 1/4x2-1/4': { weight: 1.91, category: 'Flats' },
  'FL 1/4x2-1/2': { weight: 2.13, category: 'Flats' },
  'FL 1/4x2-3/4': { weight: 2.34, category: 'Flats' },
  'FL 1/4x3': { weight: 2.55, category: 'Flats' },
  'FL 1/4x3-1/2': { weight: 2.98, category: 'Flats' },
  'FL 1/4x4': { weight: 3.40, category: 'Flats' },
  'FL 1/4x4-1/2': { weight: 3.83, category: 'Flats' },
  'FL 1/4x5': { weight: 4.25, category: 'Flats' },
  'FL 1/4x6': { weight: 5.10, category: 'Flats' },
  'FL 1/4x7': { weight: 5.95, category: 'Flats' },
  'FL 1/4x8': { weight: 6.80, category: 'Flats' },
  'FL 1/4x9': { weight: 7.65, category: 'Flats' },
  'FL 1/4x10': { weight: 8.50, category: 'Flats' },
  'FL 1/4x11': { weight: 9.35, category: 'Flats' },
  'FL 1/4x12': { weight: 10.20, category: 'Flats' },
  'FL 5/16x1/2': { weight: 0.53, category: 'Flats' },
  'FL 5/16x3/4': { weight: 0.80, category: 'Flats' },
  'FL 5/16x1': { weight: 1.06, category: 'Flats' },
  'FL 5/16x1-1/4': { weight: 1.33, category: 'Flats' },
  'FL 5/16x1-1/2': { weight: 1.59, category: 'Flats' },
  'FL 5/16x1-3/4': { weight: 1.86, category: 'Flats' },
  'FL 5/16x2': { weight: 2.13, category: 'Flats' },
  'FL 5/16x2-1/2': { weight: 2.66, category: 'Flats' },
  'FL 5/16x3': { weight: 3.19, category: 'Flats' },
  'FL 5/16x3-1/2': { weight: 3.72, category: 'Flats' },
  'FL 5/16x4': { weight: 4.25, category: 'Flats' },
  'FL 5/16x4-1/2': { weight: 4.78, category: 'Flats' },
  'FL 5/16x5': { weight: 5.31, category: 'Flats' },
  'FL 5/16x6': { weight: 6.38, category: 'Flats' },
  'FL 5/16x7': { weight: 7.44, category: 'Flats' },
  'FL 5/16x8': { weight: 8.50, category: 'Flats' },
  'FL 5/16x9': { weight: 9.56, category: 'Flats' },
  'FL 5/16x10': { weight: 10.63, category: 'Flats' },
  'FL 5/16x12': { weight: 12.75, category: 'Flats' },
  'FL 3/8x1/2': { weight: 0.64, category: 'Flats' },
  'FL 3/8x5/8': { weight: 0.80, category: 'Flats' },
  'FL 3/8x3/4': { weight: 0.96, category: 'Flats' },
  'FL 3/8x7/8': { weight: 1.12, category: 'Flats' },
  'FL 3/8x1': { weight: 1.28, category: 'Flats' },
  'FL 3/8x1-1/4': { weight: 1.59, category: 'Flats' },
  'FL 3/8x1-1/2': { weight: 1.91, category: 'Flats' },
  'FL 3/8x1-3/4': { weight: 2.23, category: 'Flats' },
  'FL 3/8x2': { weight: 2.55, category: 'Flats' },
  'FL 3/8x2-1/4': { weight: 2.87, category: 'Flats' },
  'FL 3/8x2-1/2': { weight: 3.19, category: 'Flats' },
  'FL 3/8x2-3/4': { weight: 3.51, category: 'Flats' },
  'FL 3/8x3': { weight: 3.83, category: 'Flats' },
  'FL 3/8x3-1/2': { weight: 4.46, category: 'Flats' },
  'FL 3/8x4': { weight: 5.10, category: 'Flats' },
  'FL 3/8x4-1/2': { weight: 5.74, category: 'Flats' },
  'FL 3/8x5': { weight: 6.38, category: 'Flats' },
  'FL 3/8x5-1/2': { weight: 7.01, category: 'Flats' },
  'FL 3/8x6': { weight: 7.65, category: 'Flats' },
  'FL 3/8x7': { weight: 8.93, category: 'Flats' },
  'FL 3/8x8': { weight: 10.20, category: 'Flats' },
  'FL 3/8x9': { weight: 11.48, category: 'Flats' },
  'FL 3/8x10': { weight: 12.75, category: 'Flats' },
  'FL 3/8x11': { weight: 14.03, category: 'Flats' },
  'FL 3/8x12': { weight: 15.30, category: 'Flats' },
  'FL 1/2x3/4': { weight: 1.28, category: 'Flats' },
  'FL 1/2x1': { weight: 1.70, category: 'Flats' },
  'FL 1/2x1-1/4': { weight: 2.13, category: 'Flats' },
  'FL 1/2x1-1/2': { weight: 2.55, category: 'Flats' },
  'FL 1/2x1-3/4': { weight: 2.98, category: 'Flats' },
  'FL 1/2x2': { weight: 3.40, category: 'Flats' },
  'FL 1/2x2-1/4': { weight: 3.83, category: 'Flats' },
  'FL 1/2x2-1/2': { weight: 4.25, category: 'Flats' },
  'FL 1/2x2-3/4': { weight: 4.68, category: 'Flats' },
  'FL 1/2x3': { weight: 5.10, category: 'Flats' },
  'FL 1/2x3-1/2': { weight: 5.95, category: 'Flats' },
  'FL 1/2x4': { weight: 6.80, category: 'Flats' },
  'FL 1/2x4-1/2': { weight: 7.65, category: 'Flats' },
  'FL 1/2x5': { weight: 8.50, category: 'Flats' },
  'FL 1/2x5-1/2': { weight: 9.35, category: 'Flats' },
  'FL 1/2x6': { weight: 10.20, category: 'Flats' },
  'FL 1/2x7': { weight: 11.90, category: 'Flats' },
  'FL 1/2x8': { weight: 13.60, category: 'Flats' },
  'FL 1/2x9': { weight: 15.30, category: 'Flats' },
  'FL 1/2x10': { weight: 17.00, category: 'Flats' },
  'FL 1/2x12': { weight: 20.40, category: 'Flats' },
  'FL 5/8x1': { weight: 2.13, category: 'Flats' },
  'FL 5/8x1-1/2': { weight: 3.19, category: 'Flats' },
  'FL 5/8x1-3/4': { weight: 3.72, category: 'Flats' },
  'FL 5/8x2': { weight: 4.25, category: 'Flats' },
  'FL 5/8x2-1/4': { weight: 4.78, category: 'Flats' },
  'FL 5/8x2-1/2': { weight: 5.31, category: 'Flats' },
  'FL 5/8x2-3/4': { weight: 5.84, category: 'Flats' },
  'FL 5/8x3': { weight: 6.38, category: 'Flats' },
  'FL 5/8x3-1/2': { weight: 7.44, category: 'Flats' },
  'FL 5/8x4': { weight: 8.50, category: 'Flats' },
  'FL 5/8x4-1/2': { weight: 9.56, category: 'Flats' },
  'FL 5/8x5': { weight: 10.63, category: 'Flats' },
  'FL 5/8x6': { weight: 12.75, category: 'Flats' },
  'FL 5/8x7': { weight: 14.88, category: 'Flats' },
  'FL 5/8x8': { weight: 17.00, category: 'Flats' },
  'FL 5/8x9': { weight: 19.13, category: 'Flats' },
  'FL 5/8x10': { weight: 21.25, category: 'Flats' },
  'FL 5/8x12': { weight: 25.50, category: 'Flats' },
  'FL 3/4x1': { weight: 2.55, category: 'Flats' },
  'FL 3/4x1-1/4': { weight: 3.19, category: 'Flats' },
  'FL 3/4x1-1/2': { weight: 3.83, category: 'Flats' },
  'FL 3/4x1-3/4': { weight: 4.46, category: 'Flats' },
  'FL 3/4x2': { weight: 5.10, category: 'Flats' },
  'FL 3/4x2-1/2': { weight: 6.38, category: 'Flats' },
  'FL 3/4x3': { weight: 7.65, category: 'Flats' },
  'FL 3/4x3-1/2': { weight: 8.93, category: 'Flats' },
  'FL 3/4x4': { weight: 10.20, category: 'Flats' },
  'FL 3/4x4-1/2': { weight: 11.48, category: 'Flats' },
  'FL 3/4x5': { weight: 12.75, category: 'Flats' },
  'FL 3/4x6': { weight: 15.30, category: 'Flats' },
  'FL 3/4x7': { weight: 17.85, category: 'Flats' },
  'FL 3/4x8': { weight: 20.40, category: 'Flats' },
  'FL 3/4x9': { weight: 22.95, category: 'Flats' },
  'FL 3/4x10': { weight: 25.50, category: 'Flats' },
  'FL 3/4x12': { weight: 30.60, category: 'Flats' },
  'FL 7/8x2': { weight: 5.95, category: 'Flats' },
  'FL 7/8x2-1/2': { weight: 7.44, category: 'Flats' },
  'FL 7/8x3': { weight: 8.93, category: 'Flats' },
  'FL 7/8x4': { weight: 11.90, category: 'Flats' },
  'FL 7/8x5': { weight: 14.88, category: 'Flats' },
  'FL 7/8x6': { weight: 17.85, category: 'Flats' },
  'FL 7/8x8': { weight: 23.80, category: 'Flats' },
  'FL 7/8x10': { weight: 29.75, category: 'Flats' },
  'FL 7/8x12': { weight: 35.70, category: 'Flats' },
  'FL 1x1-1/4': { weight: 4.25, category: 'Flats' },
  'FL 1x1-1/2': { weight: 5.10, category: 'Flats' },
  'FL 1x1-3/4': { weight: 5.95, category: 'Flats' },
  'FL 1x2': { weight: 6.80, category: 'Flats' },
  'FL 1x2-1/2': { weight: 8.50, category: 'Flats' },
  'FL 1x3': { weight: 10.20, category: 'Flats' },
  'FL 1x3-1/2': { weight: 11.90, category: 'Flats' },
  'FL 1x4': { weight: 13.60, category: 'Flats' },
  'FL 1x4-1/2': { weight: 15.30, category: 'Flats' },
  'FL 1x5': { weight: 17.00, category: 'Flats' },
  'FL 1x6': { weight: 20.40, category: 'Flats' },
  'FL 1x8': { weight: 27.20, category: 'Flats' },
  'FL 1x9': { weight: 30.60, category: 'Flats' },
  'FL 1x10': { weight: 34.00, category: 'Flats' },
  'FL 1x12': { weight: 40.80, category: 'Flats' }
};

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
  // Welding (global rates)
  'Welding- Fillet':          'weldFilletRate',
  'Welding- Bevel/Grind':     'weldBevelRate',
  'Welding- PJP':             'weldPjpRate',
  'Welding- CJP':             'weldCjpRate',
};

// Maps connection operation → weight field in pricing result
const OP_WEIGHT_FIELD = {
  'WF Connx':        'connxWeightLbs',
  'WF Moment Connx': 'momentConnxWeightLbs',
  'C Connx':         'connxWeightLbs',
  'C Moment Connx':  'momentConnxWeightLbs',
};

// Default unit for each operation type (omitted = 'EA')
const OP_DEFAULT_UNIT = {
  'Welding- Fillet':      'IN',
  'Welding- Bevel/Grind': 'IN',
  'Welding- PJP':         'IN',
  'Welding- CJP':         'IN',
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
    'Roll'
  ],
  welding: [
    'Welding- Fillet',
    'Welding- Bevel/Grind',
    'Welding- PJP',
    'Welding- CJP'
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
]);

// Flattened list for dropdowns
const allFabOperations = [
  ...fabricationOperations.cutting,
  ...fabricationOperations.drilling,
  ...fabricationOperations.prep,
  ...fabricationOperations.welding,
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

// Standard exclusions
const standardExclusions = [
  'Bond/Tax',
  'Weekend, Night, Overtime Work',
  'Engineering/Shop Drawings',
  'Demolition/Shoring',
  'Finish Paint',
  'Inspections/Permits of any kind',
  'Removal and/or Replacement of fireproofing',
  'Signage of any kind',
  'MEP work of any kind',
  'Grout or Concrete Work',
  'Protection of existing finishes',
  'X-Ray or Scanning of any kind',
  'Drug testing/Badging/Background Checks',
  'Crane/Equipment rental',
  'Hoisting by others',
  'Access/Scaffolding by others'
];

// Standard qualifications
const standardQualifications = [
  'Proposal valid for 30 days',
  'Steel pricing subject to mill confirmation',
  'Based on drawings provided, changes may result in additional costs',
  'Standard lead time applies',
  'Access to work area during normal business hours',
  'Clear and level staging area required',
  'Single mobilization included',
  'Payment terms: Net 30'
];

// Stock lengths - Pipe only uses 21' and 42', all others use standard lengths
const standardStockLengths = [20, 25, 30, 35, 40, 45, 50, 55, 60];
const pipeStockLengths = [21, 42];
const plateStockLengths = [4, 8, 10, 12, 20]; // Plate lengths in feet (from 48", 96", 120", 144" sheets; 20' for bar stock)
const roundBarStockLengths = [12, 20]; // Round bar standard mill lengths

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

// Get stock lengths based on category
const getStockLengthsForCategory = (category) => {
  if (category === 'Pipe') {
    return pipeStockLengths;
  }
  if (category === 'Plate') {
    return plateStockLengths;
  }
  if (category === 'Round Bar') {
    return roundBarStockLengths;
  }
  return standardStockLengths;
};

// Normalize steel shape size strings coming from vendor CSVs.
// Fixes UTF-8 mojibake (× encoded as Windows-1252 → "Ã—") and strips inch marks.
// Preserves industry conventions: fractions for plates (3/4), decimals for HSS (.25).
const normalizeShapeSize = (raw) => {
  if (!raw) return raw;
  let s = raw;
  // Fix mojibake: × (U+00D7) mis-decoded as Windows-1252 produces "Ã" + 0x97
  s = s.replace(/Ã[\u0097\u00d7×—]/g, 'x');
  // Replace any remaining true Unicode multiplication sign
  s = s.replace(/[×\u00d7]/g, 'x');
  // Strip inch marks (vendors don't use them, cleaner in Excel)
  s = s.replace(/"/g, '');
  return s.trim();
};

// Custom rounding rule: ≤0.29 rounds down, >0.29 rounds up
// Applied to weights (whole numbers) and prices (whole dollars)
const roundCustom = (num) => {
  if (num === null || num === undefined || isNaN(num)) return 0;
  const decimal = num - Math.floor(num);
  return decimal <= 0.29 ? Math.floor(num) : Math.ceil(num);
};

// Format weight with custom rounding (whole numbers)
const fmtWt = (num) => {
  return roundCustom(num).toLocaleString();
};

// Format price with custom rounding (whole dollars)
const fmtPrice = (num) => {
  return '$' + roundCustom(num).toLocaleString();
};

// Format price for quotes with 2 decimal places (e.g., $1,234.00)
const fmtQuotePrice = (num) => {
  const rounded = roundCustom(num);
  return '$' + rounded.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Nesting optimization calculator
const calculateOptimalStock = (pieces, length, availableStockLengths) => {
  if (!pieces || pieces <= 0 || !length || length <= 0) {
    return { optimalLength: availableStockLengths[0], stocksRequired: 0, waste: 0, efficiency: 0 };
  }
  
  let bestResult = {
    optimalLength: availableStockLengths[0],
    stocksRequired: pieces,
    waste: Infinity,
    efficiency: 0,
    piecesPerStock: 1
  };
  
  for (const stockLen of availableStockLengths) {
    if (stockLen < length) continue; // Skip if piece doesn't fit
    
    const piecesPerStock = Math.floor(stockLen / length);
    if (piecesPerStock <= 0) continue;
    
    const stocksNeeded = Math.ceil(pieces / piecesPerStock);
    const totalStockLength = stocksNeeded * stockLen;
    const totalUsedLength = pieces * length;
    const totalWaste = totalStockLength - totalUsedLength;
    const efficiency = (totalUsedLength / totalStockLength) * 100;
    
    // Better solution if less waste (or same waste but fewer stocks)
    if (totalWaste < bestResult.waste || 
        (totalWaste === bestResult.waste && stocksNeeded < bestResult.stocksRequired)) {
      bestResult = {
        optimalLength: stockLen,
        stocksRequired: stocksNeeded,
        waste: totalWaste,
        efficiency: efficiency,
        piecesPerStock: piecesPerStock
      };
    }
  }
  
  return bestResult;
};

// Translate Revu size format to AISC database format
// Examples: "HSS  3 x 2 x 1/4" -> "HSS3x2x1/4", "L 4 x 4 x 1/4" -> "L4x4x1/4"
const translateSizeToAISC = (revuSize) => {
  if (!revuSize || typeof revuSize !== 'string') return { size: '', category: 'Custom', matched: false };
  
  // Normalize: trim, collapse multiple spaces, remove spaces around 'x'
  let normalized = revuSize.trim()
    .replace(/\s+/g, ' ')           // Collapse multiple spaces
    .replace(/\s*x\s*/gi, 'x')      // Remove spaces around x
    .replace(/\s*-\s*/g, '-');      // Normalize dashes
  
  // Try different patterns to match AISC format
  // Pattern 1: Direct match after normalization
  if (steelDatabase[normalized]) {
    return { size: normalized, category: steelDatabase[normalized].category, matched: true };
  }
  
  // Pattern 2: Remove all spaces
  const noSpaces = normalized.replace(/\s/g, '');
  if (steelDatabase[noSpaces]) {
    return { size: noSpaces, category: steelDatabase[noSpaces].category, matched: true };
  }
  
  // Pattern 3: Handle "HSS  3 x 2 x 1/4" -> "HSS3x2x1/4"
  const hssMatch = normalized.match(/^(HSS)\s*(.+)/i);
  if (hssMatch) {
    const hssSize = 'HSS' + hssMatch[2].replace(/\s/g, '');
    if (steelDatabase[hssSize]) {
      return { size: hssSize, category: steelDatabase[hssSize].category, matched: true };
    }

    // Pattern 3b: Handle gauge notation  "HSS8x2x11ga" -> "HSS8x2x1/8"
    const GAUGE_TO_FRACTION = {
      '3':  '1/4',
      '7':  '3/16',
      '11': '1/8',
    };
    const gaugeMatch = hssSize.match(/^(HSS[\dx]+x)(\d+)\s*ga$/i);
    if (gaugeMatch) {
      const fraction = GAUGE_TO_FRACTION[gaugeMatch[2]];
      if (fraction) {
        const converted = gaugeMatch[1] + fraction;
        if (steelDatabase[converted]) {
          return { size: converted, category: steelDatabase[converted].category, matched: true };
        }
      }
    }
  }

  // Pattern 4: Handle "L 4 x 4 x 1/4" -> "L4x4x1/4"
  const angleMatch = normalized.match(/^(L)\s*(.+)/i);
  if (angleMatch) {
    const angleSize = 'L' + angleMatch[2].replace(/\s/g, '');
    if (steelDatabase[angleSize]) {
      return { size: angleSize, category: steelDatabase[angleSize].category, matched: true };
    }
  }
  
  // Pattern 5: Handle "W 18 x 35" -> "W18x35"
  const wMatch = normalized.match(/^(W)\s*(.+)/i);
  if (wMatch) {
    const wSize = 'W' + wMatch[2].replace(/\s/g, '');
    if (steelDatabase[wSize]) {
      return { size: wSize, category: steelDatabase[wSize].category, matched: true };
    }
  }
  
  // Pattern 6: Handle "C 10 x 15.3" -> "C10x15.3"
  const cMatch = normalized.match(/^(C)\s*(.+)/i);
  if (cMatch) {
    const cSize = 'C' + cMatch[2].replace(/\s/g, '');
    if (steelDatabase[cSize]) {
      return { size: cSize, category: steelDatabase[cSize].category, matched: true };
    }
  }
  
  // Pattern 7: Handle "MC 10 x 8.4" -> "MC10x8.4"
  const mcMatch = normalized.match(/^(MC)\s*(.+)/i);
  if (mcMatch) {
    const mcSize = 'MC' + mcMatch[2].replace(/\s/g, '');
    if (steelDatabase[mcSize]) {
      return { size: mcSize, category: steelDatabase[mcSize].category, matched: true };
    }
  }
  
  // Pattern 8: Handle Pipe sizes "PIPE 4" -> "PIPE4 STD" or similar
  const pipeMatch = normalized.match(/^PIPE\s*(\d+)/i);
  if (pipeMatch) {
    // Try different pipe variations
    const pipeVariations = [
      `PIPE${pipeMatch[1]} STD`,
      `PIPE${pipeMatch[1]} XS`,
      `PIPE${pipeMatch[1]} XXS`
    ];
    for (const pv of pipeVariations) {
      if (steelDatabase[pv]) {
        return { size: pv, category: 'Pipe', matched: true };
      }
    }
  }
  
  // Pattern 9: Plate "PL 3/8 x 6", "PL 1/2 x 8", "PL 0.375 x 6"
  const plateMatch = normalized.match(/^PL\s+(\S+)\s*x\s*(\S+)/i);
  if (plateMatch) {
    const thicknessStr = plateMatch[1];
    const widthStr = plateMatch[2];
    let thickness = 0;
    if (thicknessStr.includes('/')) {
      const [num, den] = thicknessStr.split('/');
      thickness = parseInt(num) / parseInt(den);
    } else {
      thickness = parseFloat(thicknessStr);
    }
    const width = parseFloat(widthStr);
    if (thickness > 0 && width > 0) {
      return { size: normalized, category: 'Plate', plateThickness: thickness, plateWidth: width, matched: true };
    }
  }

  // No match found - return as custom with original normalized value
  return { size: normalized, category: 'Custom', matched: false };
};

// Parse CSV content from Revu Markup List export
const parseRevuCSV = (csvContent) => {
  // Strip BOM (Byte Order Mark) if present - common in Windows exports
  let cleanContent = csvContent;
  if (cleanContent.charCodeAt(0) === 0xFEFF) {
    cleanContent = cleanContent.slice(1);
  }
  // Also handle UTF-8 BOM as bytes
  if (cleanContent.startsWith('\uFEFF')) {
    cleanContent = cleanContent.slice(1);
  }
  
  // Clean up encoding artifacts from Windows/Bluebeam exports
  // These appear when UTF-8 is misread as Windows-1252 or vice versa
  cleanContent = cleanContent
    // Check marks - various encodings
    .replace(/\u2713/g, '*')      // Unicode check mark
    .replace(/\u2714/g, '*')      // Heavy check mark
    .replace(/âœ"/g, '*')          // UTF-8 check as Windows-1252
    .replace(/âœ"/g, '*')          // Variant
    .replace(/\xE2\x9C\x93/g, '*') // Raw UTF-8 bytes for check
    .replace(/\xE2\x9C\x94/g, '*') // Raw UTF-8 bytes for heavy check
    // Bullets - various encodings
    .replace(/\u2022/g, '-')      // Unicode bullet
    .replace(/â€¢/g, '-')          // UTF-8 bullet as Windows-1252
    .replace(/\xE2\x80\xA2/g, '-') // Raw UTF-8 bytes for bullet
    .replace(/•/g, '-')           // HTML bullet entity
    // Dashes
    .replace(/\u2013/g, '-')      // En dash
    .replace(/\u2014/g, '--')     // Em dash
    .replace(/â€"/g, '-')          // En dash misencoded
    .replace(/â€"/g, '--')         // Em dash misencoded
    // Quotes
    .replace(/\u201C/g, '"')      // Left double quote
    .replace(/\u201D/g, '"')      // Right double quote
    .replace(/\u2018/g, "'")      // Left single quote
    .replace(/\u2019/g, "'")      // Right single quote
    .replace(/â€œ/g, '"')          // Left double quote misencoded
    .replace(/â€/g, '"')           // Right double quote partial
    .replace(/â€™/g, "'")          // Right single quote misencoded
    .replace(/â€˜/g, "'")          // Left single quote misencoded
    // Other cleanup
    .replace(/\u00A0/g, ' ')      // Non-breaking space
    .replace(/Â/g, '')            // Stray high-bit character
    .replace(/Ã¢/g, '')           // Encoding artifact
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''); // Control characters
  
  const lines = cleanContent.split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [], error: 'CSV file is empty or has no data rows' };
  
  // Parse header row
  const headers = parseCSVLine(lines[0]);
  
  // Find required column indices
  const colMap = {
    itemNumber: findColumnIndex(headers, ['Item #', 'Item Number', 'Item']),
    itemDescription: findColumnIndex(headers, ['Item Description', 'Description']),
    partLabel: findColumnIndex(headers, ['Part Label', 'Label']),
    matSize: findColumnIndex(headers, ['(Non-Flat) Mat Size', 'Mat Size', 'Non-Flat Mat Size', 'Material Size', 'Size']),
    matSizeFlats: findColumnIndex(headers, ['Mat Size (Flats)', 'Flat Mat Size']),
    fabLength: findColumnIndex(headers, ['Fab Length', 'Length']),
    page: findColumnIndex(headers, ['Page', 'page', 'Page Number']),
    qty: findColumnIndex(headers, ['Qty', 'Quantity'])
  };
  
  // Validate required columns
  const missingCols = [];
  if (colMap.itemNumber === -1) missingCols.push('Item #');
  if (colMap.matSize === -1 && colMap.matSizeFlats === -1) missingCols.push('Mat Size');
  if (colMap.fabLength === -1) missingCols.push('Fab Length');
  
  if (missingCols.length > 0) {
    return { headers, rows: [], error: `Missing required columns: ${missingCols.join(', ')}` };
  }
  
  // Parse data rows
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const values = parseCSVLine(lines[i]);
    
    // Get mat size from either column (prefer non-flat)
    let matSize = colMap.matSize !== -1 ? values[colMap.matSize] : '';
    if (!matSize && colMap.matSizeFlats !== -1) {
      matSize = values[colMap.matSizeFlats];
    }
    
    const fabLength = parseFloat(values[colMap.fabLength]) || 0;
    
    // Skip rows without mat size or fab length (scope rectangles)
    if (!matSize || fabLength <= 0) continue;
    
    rows.push({
      itemNumber: values[colMap.itemNumber] || '',
      itemDescription: colMap.itemDescription !== -1 ? values[colMap.itemDescription] : '',
      partLabel: colMap.partLabel !== -1 ? values[colMap.partLabel] : '',
      matSize: matSize,
      fabLength: fabLength,
      page: colMap.page !== -1 ? values[colMap.page] : '',
      qty: colMap.qty !== -1 ? (parseInt(values[colMap.qty]) || 1) : 1
    });
  }
  
  return { headers, rows, error: null, colMap };
};

// Parse a single CSV line handling quoted fields
const parseCSVLine = (line) => {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  
  return result;
};

// Find column index by possible names
const findColumnIndex = (headers, possibleNames) => {
  for (const name of possibleNames) {
    const idx = headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
};

// Aggregate parsed rows into items structure
const aggregateImportData = (rows) => {
  const itemsMap = new Map();
  const unmatchedSizes = new Set();
  
  for (const row of rows) {
    const itemKey = row.itemNumber;
    if (!itemKey) continue;
    
    // Get or create item
    if (!itemsMap.has(itemKey)) {
      itemsMap.set(itemKey, {
        itemNumber: row.itemNumber,
        itemName: row.itemDescription || 'Imported Item',
        pages: new Set(),
        materialsMap: new Map()
      });
    }
    
    const item = itemsMap.get(itemKey);
    
    // Add page reference
    if (row.page) {
      item.pages.add(row.page);
    }
    
    // Update item name if we have a description and current is default
    if (row.itemDescription && item.itemName === 'Imported Item') {
      item.itemName = row.itemDescription;
    }
    
    // Translate size
    const sizeResult = translateSizeToAISC(row.matSize);
    if (!sizeResult.matched) {
      unmatchedSizes.add(row.matSize);
    }
    
    // Create material key for aggregation
    const matKey = `${sizeResult.size}|${row.fabLength}|${row.partLabel || ''}`;
    
    if (!item.materialsMap.has(matKey)) {
      item.materialsMap.set(matKey, {
        description: row.partLabel || '',
        size: sizeResult.size,
        category: sizeResult.category,
        matched: sizeResult.matched,
        originalSize: row.matSize,
        length: row.fabLength,
        pieces: 0
      });
    }
    
    // Aggregate quantity
    item.materialsMap.get(matKey).pieces += row.qty;
  }
  
  // Convert to array structure
  const result = [];
  for (const [itemNumber, item] of itemsMap) {
    const materials = Array.from(item.materialsMap.values());
    result.push({
      itemNumber: item.itemNumber,
      itemName: item.itemName,
      drawingRef: Array.from(item.pages).sort((a, b) => parseInt(a) - parseInt(b)).join(', '),
      materials: materials
    });
  }
  
  // Sort by item number
  result.sort((a, b) => a.itemNumber.localeCompare(b.itemNumber, undefined, { numeric: true }));
  
  return { items: result, unmatchedSizes: Array.from(unmatchedSizes) };
};

// Get unique categories
const categories = [...new Set(Object.values(steelDatabase).map(s => s.category)), 'Plate'].filter(c => c !== 'Flats').sort();

const STATUS_COLORS = {
  DRAFT: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600',
  IN_REVIEW: 'bg-amber-100 text-amber-700 border-amber-300',
  PUBLISHED: 'bg-green-100 text-green-700 border-green-300',
  REOPENED: 'bg-purple-100 text-purple-700 border-purple-300',
};
const STATUS_LABELS = { DRAFT: 'Draft', IN_REVIEW: 'In Review', PUBLISHED: 'Published', REOPENED: 'Reopened' };

const SteelEstimator = ({ projectId, userRole, userName }) => {
  const [activeTab, setActiveTab] = useState('project');
  const [showTaxBreakdown, setShowTaxBreakdown] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [currentProjectId, setCurrentProjectId] = useState(projectId || null);
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [projectStatus, setProjectStatus] = useState('DRAFT');
  const [statusChanging, setStatusChanging] = useState(false);
  
  // Project Info
  const [projectName, setProjectName] = useState('');
  const [projectAddress, setProjectAddress] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerId, setCustomerId] = useState(null);
  const [billingAddress, setBillingAddress] = useState('');
  const [customerContact, setCustomerContact] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [estimateDate, setEstimateDate] = useState(new Date().toISOString().split('T')[0]);
  const [bidTime, setBidTime] = useState('');
  const [estimatedBy, setEstimatedBy] = useState('');
  const [drawingDate, setDrawingDate] = useState('');
  const [drawingRevision, setDrawingRevision] = useState('');
  const [architect, setArchitect] = useState('');

  // Dashboard fields
  const [estimatorId, setEstimatorId] = useState(null);
  const [dashboardStatus, setDashboardStatus] = useState('');
  const [newOrCo, setNewOrCo] = useState('');
  const [notes, setNotes] = useState('');
  const [usersList, setUsersList] = useState([]);

  // Project Types
  const [projectTypes, setProjectTypes] = useState({
    structural: false,
    miscellaneous: false,
    ornamental: false
  });
  
  const toggleProjectType = (type) => {
    setProjectTypes(prev => ({ ...prev, [type]: !prev[type] }));
  };
  
  // Delivery Options
  const [deliveryOptions, setDeliveryOptions] = useState({
    installed: false,
    fobJobsite: false,
    willCall: false
  });
  
  const toggleDeliveryOption = (option) => {
    setDeliveryOptions({ installed: false, fobJobsite: false, willCall: false, [option]: true });
    setSelectedCustomDelivery(null);
  };
  
  // Tax Category
  const TAX_RATE = 0.0825;
  const [taxCategory, setTaxCategory] = useState(null);
  
  const taxCategoryDescriptions = {
    newConstruction: {
      label: 'New Construction',
      description: 'Separated contract — tax applies to materials only. Fabrication labor and installation labor are not taxable.',
      color: 'blue'
    },
    resale: {
      label: 'Resale',
      description: 'Buyer provides resale certificate — no tax collected. Tax responsibility transfers to the purchaser.',
      color: 'green'
    },
    fob: {
      label: 'F.O.B.',
      description: 'Sale of fabricated tangible personal property — tax applies to materials and fabrication. Customer takes title at shop.',
      color: 'amber'
    },
    noTax: {
      label: 'No Tax',
      description: 'Government, exempt organizations, or other tax-exempt entities — no tax on any cost component.',
      color: 'gray'
    }
  };

  // Calculate tax for a single item based on taxCategory
  const calculateItemTax = (item) => {
    if (!taxCategory || taxCategory === 'resale' || taxCategory === 'noTax') return 0;
    
    const matCost = item.materials.reduce((s, m) => s + (m.totalCost || 0), 0);
    const matMarkup = matCost * (item.materialMarkup || 0) / 100;
    
    if (taxCategory === 'newConstruction') {
      return (matCost + matMarkup) * TAX_RATE;
    }
    
    if (taxCategory === 'fob') {
      const matFabCost = item.materials.reduce((s, m) => s + ((m.fabrication || []).reduce((fs, f) => fs + (f.totalCost || 0), 0)), 0);
      const itemFabCost = item.fabrication.reduce((s, f) => s + (f.totalCost || 0), 0);
      const fabCost = matFabCost + itemFabCost;
      const fabMarkup = fabCost * (item.fabMarkup || 0) / 100;
      return (matCost + matMarkup + fabCost + fabMarkup) * TAX_RATE;
    }
    
    return 0;
  };

  const getItemTaxBreakdown = (item) => {
    const matCost = item.materials.reduce((s, m) => s + (m.totalCost || 0), 0);
    const matMarkupPct = item.materialMarkup || 0;
    const matMarkup = matCost * matMarkupPct / 100;
    const matFabCost = item.materials.reduce((s, m) => s + ((m.fabrication || []).reduce((fs, f) => fs + (f.totalCost || 0), 0)), 0);
    const itemFabCost = item.fabrication.reduce((s, f) => s + (f.totalCost || 0), 0);
    const fabCost = matFabCost + itemFabCost;
    const fabMarkupPct = item.fabMarkup || 0;
    const fabMarkup = fabCost * fabMarkupPct / 100;
    const recapTotal = Object.values(item.recapCosts).reduce((s, c) => s + (c.total || 0), 0);

    let taxableBase = 0;
    let taxableComponents = [];
    let notTaxed = [];

    if (!taxCategory || taxCategory === 'resale' || taxCategory === 'noTax') {
      notTaxed = ['Materials', 'Material Markup', 'Fabrication', 'Fab Markup', 'Recap Costs'];
    } else if (taxCategory === 'newConstruction') {
      taxableBase = matCost + matMarkup;
      if (matCost > 0) taxableComponents.push({ label: 'Material Cost', amount: matCost });
      if (matMarkup > 0) taxableComponents.push({ label: `Material Markup (${matMarkupPct}%)`, amount: matMarkup });
      notTaxed = [];
      if (fabCost > 0) notTaxed.push(`Fabrication (${fmtPrice(fabCost)})`);
      if (fabMarkup > 0) notTaxed.push(`Fab Markup (${fmtPrice(fabMarkup)})`);
      if (recapTotal > 0) notTaxed.push(`Recap/Labor (${fmtPrice(recapTotal)})`);
    } else if (taxCategory === 'fob') {
      taxableBase = matCost + matMarkup + fabCost + fabMarkup;
      if (matCost > 0) taxableComponents.push({ label: 'Material Cost', amount: matCost });
      if (matMarkup > 0) taxableComponents.push({ label: `Material Markup (${matMarkupPct}%)`, amount: matMarkup });
      if (fabCost > 0) taxableComponents.push({ label: 'Fabrication Cost', amount: fabCost });
      if (fabMarkup > 0) taxableComponents.push({ label: `Fab Markup (${fabMarkupPct}%)`, amount: fabMarkup });
      notTaxed = [];
      if (recapTotal > 0) notTaxed.push(`Recap/Labor (${fmtPrice(recapTotal)})`);
    }

    const taxAmount = taxableBase * TAX_RATE;
    return { taxableBase, taxableComponents, notTaxed, taxAmount, matCost, matMarkup, fabCost, fabMarkup, recapTotal };
  };
  
  // Vendor RFQ
  const [showRfqModal, setShowRfqModal] = useState(false);
  const [rfqVendors, setRfqVendors] = useState([
    { id: 1, name: '', email: '', phone: '' }
  ]);
  const [rfqNotes, setRfqNotes] = useState('');
  const [rfqDeliveryDate, setRfqDeliveryDate] = useState('');
  const [rfqResponseDate, setRfqResponseDate] = useState('');
  const [rfqUploadResult, setRfqUploadResult] = useState(null);
  
  const addRfqVendor = () => {
    setRfqVendors([...rfqVendors, { id: Date.now(), name: '', email: '', phone: '' }]);
  };
  
  const updateRfqVendor = (id, field, value) => {
    setRfqVendors(rfqVendors.map(v => v.id === id ? { ...v, [field]: value } : v));
  };
  
  const removeRfqVendor = (id) => {
    if (rfqVendors.length > 1) {
      setRfqVendors(rfqVendors.filter(v => v.id !== id));
    }
  };
  
  // Generate RFQ text for email/clipboard
  const generateRfqText = () => {
    let text = `REQUEST FOR QUOTATION\n`;
    text += `${'='.repeat(50)}\n\n`;
    text += `Project: ${projectName || 'TBD'}\n`;
    text += `Location: ${projectAddress || 'TBD'}\n`;
    text += `Date: ${new Date().toLocaleDateString()}\n`;
    if (rfqResponseDate) text += `Quote Needed By: ${new Date(rfqResponseDate).toLocaleDateString()}\n`;
    if (rfqDeliveryDate) text += `Delivery Required: ${new Date(rfqDeliveryDate).toLocaleDateString()}\n`;
    text += `\n${'='.repeat(50)}\n`;
    text += `MATERIAL LIST\n`;
    text += `${'='.repeat(50)}\n\n`;
    text += `${'Size'.padEnd(20)}${'Length'.padEnd(10)}${'Qty'.padEnd(8)}${'Wt/ft'.padEnd(10)}${'Est. Wt'.padEnd(12)}${'Your Price'.padEnd(12)}\n`;
    text += `${'-'.repeat(72)}\n`;
    
    let totalWeight = 0;
    stockList.forEach(stock => {
      totalWeight += stock.totalWeight;
      text += `${stock.size.padEnd(20)}${(stock.stockLength + "'").padEnd(10)}${String(stock.totalStocks).padEnd(8)}${stock.weightPerFoot.toFixed(1).padEnd(10)}${String(roundCustom(stock.totalWeight)).padEnd(12)}${'$_______'}\n`;
    });
    
    text += `${'-'.repeat(72)}\n`;
    text += `${'TOTAL ESTIMATED WEIGHT:'.padEnd(48)}${roundCustom(totalWeight)} lbs\n\n`;
    text += `${'='.repeat(50)}\n`;
    text += `QUOTE SUMMARY\n`;
    text += `${'='.repeat(50)}\n\n`;
    text += `Total Material Price: $______________\n`;
    text += `Delivery Charge: $______________\n`;
    text += `Total Quote: $______________\n`;
    text += `Lead Time: ______________ days\n\n`;
    
    if (rfqNotes) {
      text += `NOTES:\n${rfqNotes}\n\n`;
    }
    
    text += `Please return quote to:\n`;
    text += `${estimatedBy || '[Your Name]'}\n`;
    text += `${customerEmail || '[Your Email]'}\n`;
    
    return text;
  };
  // Click-outside handler for export dropdown
  useEffect(() => {
    const handler = (e) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target))
        setShowExportMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // PDF Export handlers
  const handleExportErectorScope = async () => {
    setShowExportMenu(false); setPdfExporting(true);
    try {
      const { pdf } = await import('@react-pdf/renderer');
      const { ErectorScopePdf } = await import('./pdf/ErectorScopePdf');
      const blob = await pdf(<ErectorScopePdf logo={COMPANY_LOGO} projectName={projectName}
        projectAddress={projectAddress} drawingRevision={drawingRevision}
        drawingDate={drawingDate} estimateDate={estimateDate} estimatedBy={estimatedBy}
        architect={architect} projectTypes={projectTypes} deliveryOptions={deliveryOptions}
        customProjectTypes={customProjectTypes} selectedCustomDelivery={selectedCustomDelivery}
        selectedExclusions={selectedExclusions} customExclusions={customExclusions}
        selectedQualifications={selectedQualifications} customQualifications={customQualifications}
        items={items} />).toBlob();
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(blob),
        download: `${projectName || 'ErectorScope'}_${new Date().toISOString().slice(0,10)}.pdf`
      });
      a.click(); URL.revokeObjectURL(a.href);
    } catch(e) { alert('PDF export failed: ' + e.message); }
    finally { setPdfExporting(false); }
  };

  const handleExportJobFolder = async () => {
    setShowExportMenu(false); setPdfExporting(true);
    try {
      const { pdf } = await import('@react-pdf/renderer');
      const { JobFolderPdf } = await import('./pdf/JobFolderPdf');
      const blob = await pdf(<JobFolderPdf logo={COMPANY_LOGO} projectName={projectName}
        projectAddress={projectAddress} customerName={customerName}
        billingAddress={billingAddress} customerContact={customerContact}
        customerPhone={customerPhone} customerEmail={customerEmail}
        estimateDate={estimateDate} estimatedBy={estimatedBy}
        drawingDate={drawingDate} drawingRevision={drawingRevision} architect={architect}
        projectTypes={projectTypes} deliveryOptions={deliveryOptions} taxCategory={taxCategory}
        customProjectTypes={customProjectTypes} selectedCustomDelivery={selectedCustomDelivery}
        items={items} breakoutTotals={breakoutTotals}
        selectedExclusions={selectedExclusions} customExclusions={customExclusions}
        selectedQualifications={selectedQualifications} customQualifications={customQualifications}
        customRecapColumns={customRecapColumns} totals={totals} />).toBlob();
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(blob),
        download: `${projectName || 'JobFolder'}_${new Date().toISOString().slice(0,10)}.pdf`
      });
      a.click(); URL.revokeObjectURL(a.href);
    } catch(e) { alert('PDF export failed: ' + e.message); }
    finally { setPdfExporting(false); }
  };

  
  // Copy RFQ to clipboard
  const copyRfqToClipboard = () => {
    const text = generateRfqText();
    navigator.clipboard.writeText(text).then(() => {
      alert('RFQ copied to clipboard! Paste into email to send to vendors.');
    });
  };
  
  // Generate CSV for Excel
  const downloadRfqCsv = () => {
    let csv = 'REQUEST FOR QUOTATION\n';
    csv += `Project,${projectName || ''}\n`;
    csv += `Location,${projectAddress || ''}\n`;
    csv += `Date,${new Date().toLocaleDateString()}\n`;
    if (rfqResponseDate) csv += `Quote Needed By,${new Date(rfqResponseDate).toLocaleDateString()}\n`;
    if (rfqDeliveryDate) csv += `Delivery Required,${new Date(rfqDeliveryDate).toLocaleDateString()}\n`;
    csv += '\n';
    csv += 'Size,Stock Length,Quantity,Weight/Ft,Est Total Weight,Your $/LB,Your $/LF,Your $/EA,Your Total,Lead Time,Notes\n';

    stockList.forEach(stock => {
      csv += `${normalizeShapeSize(stock.size)},${stock.stockLength},${stock.totalStocks},${stock.weightPerFoot.toFixed(2)},${roundCustom(stock.totalWeight)},,,,,\n`;
    });
    
    csv += '\n';
    csv += 'TOTALS,,,,' + roundCustom(stockList.reduce((sum, s) => sum + s.totalWeight, 0)) + '\n';
    csv += '\n';
    csv += 'Total Material Price,\n';
    csv += 'Delivery Charge,\n';
    csv += 'Total Quote,\n';
    
    if (rfqNotes) {
      csv += '\nNotes,' + rfqNotes.replace(/,/g, ';') + '\n';
    }
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RFQ_${projectName || 'Steel'}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Upload vendor-returned RFQ CSV and apply pricing to matching materials
  const handleRfqPricingUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = ''; // allow re-upload of same file

    const reader = new FileReader();
    reader.onload = (evt) => {
      const lines = evt.target.result.split(/\r?\n/);

      // Find the data header row (first column = "Size", case-insensitive)
      let headerIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].split(',')[0].trim().toLowerCase() === 'size') {
          headerIdx = i;
          break;
        }
      }
      if (headerIdx === -1) {
        setRfqUploadResult({ error: 'Could not find data rows. Make sure this is an RFQ CSV exported from this app.' });
        return;
      }

      const headers = lines[headerIdx].split(',').map(h => h.trim().toLowerCase());
      const sizeIdx      = headers.indexOf('size');
      const stockLenIdx  = headers.indexOf('stock length');
      const perLbIdx     = headers.findIndex(h => h.includes('$/lb'));
      const perLfIdx     = headers.findIndex(h => h.includes('$/lf'));
      const perEaIdx     = headers.findIndex(h => h.includes('$/ea'));

      // Build pricing map: "normalizedSize-stockLength" -> { priceBy, unitPrice }
      const pricingMap = new Map();
      for (let i = headerIdx + 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        const size = cols[sizeIdx];
        if (!size || size.toLowerCase().startsWith('total')) break;

        const stockLen = parseFloat(cols[stockLenIdx]) || 0;
        const perLb    = parseFloat(cols[perLbIdx]);
        const perLf    = parseFloat(cols[perLfIdx]);
        const perEa    = parseFloat(cols[perEaIdx]);

        if (!isNaN(perLb) && perLb > 0) {
          pricingMap.set(`${normalizeShapeSize(size)}-${stockLen}`, { priceBy: 'LB', unitPrice: perLb });
        } else if (!isNaN(perLf) && perLf > 0) {
          pricingMap.set(`${normalizeShapeSize(size)}-${stockLen}`, { priceBy: 'LF', unitPrice: perLf });
        } else if (!isNaN(perEa) && perEa > 0) {
          pricingMap.set(`${normalizeShapeSize(size)}-${stockLen}`, { priceBy: 'EA', unitPrice: perEa });
        }
      }

      if (pricingMap.size === 0) {
        setRfqUploadResult({ error: 'No pricing found. Make sure the vendor filled in the $/LB or $/LF columns.' });
        return;
      }

      // Determine which keys actually match materials in the current estimate
      const matchedKeys = new Set();
      items.forEach(item => {
        item.materials.forEach(mat => {
          const key = `${normalizeShapeSize(mat.size)}-${mat.stockLength}`;
          if (pricingMap.has(key)) matchedKeys.add(key);
        });
      });

      const unmatchedSizes = [];
      pricingMap.forEach((_, key) => {
        if (!matchedKeys.has(key)) unmatchedSizes.push(key.split('-')[0]);
      });

      // Apply pricing to all matching materials
      setItems(prevItems => prevItems.map(item => ({
        ...item,
        materials: item.materials.map(mat => {
          const key = `${normalizeShapeSize(mat.size)}-${mat.stockLength}`;
          const pricing = pricingMap.get(key);
          if (!pricing) return mat;
          return calculateMaterial({ ...mat, priceBy: pricing.priceBy, unitPrice: pricing.unitPrice });
        }),
      })));

      setRfqUploadResult({ matched: matchedKeys.size, total: pricingMap.size, unmatched: unmatchedSizes });
    };

    reader.readAsText(file);
  };


  // Exclusions & Qualifications
  const [selectedExclusions, setSelectedExclusions] = useState([
    'Bond/Tax', 'Engineering/Shop Drawings', 'Inspections/Permits of any kind'
  ]);
  const [customExclusions, setCustomExclusions] = useState([]);
  const [newCustomExclusion, setNewCustomExclusion] = useState('');
  const [selectedQualifications, setSelectedQualifications] = useState([
    'Proposal valid for 30 days', 'Steel pricing subject to mill confirmation'
  ]);
  const [customQualifications, setCustomQualifications] = useState([]);
  const [newCustomQualification, setNewCustomQualification] = useState('');

  const [customProjectTypes, setCustomProjectTypes] = useState([]);
  const [newCustomProjectType, setNewCustomProjectType] = useState('');
  const [customDeliveryOptions, setCustomDeliveryOptions] = useState([]);
  const [selectedCustomDelivery, setSelectedCustomDelivery] = useState(null);
  const [newCustomDeliveryOption, setNewCustomDeliveryOption] = useState('');

  // Breakout Groups
  const [breakoutGroups, setBreakoutGroups] = useState([]);
  
  // General Adjustments (internal only - baked into total but not shown on quote)
  const [adjustments, setAdjustments] = useState([]);
  
  // Custom Recap Columns
  const [customRecapColumns, setCustomRecapColumns] = useState([]);
  
  // Markup
  // Markup is now per-item in recap costs
  
  // Items
  const [expandedItems, setExpandedItems] = useState({ 1: true });
  const [items, setItems] = useState([
    {
      id: 1,
      itemNumber: '001',
      itemName: 'New Item',
      drawingRef: '',
      breakoutGroupId: null,
      materials: [],
      fabrication: [],
      // Recap costs per item
      recapCosts: {
        installation: { cost: 0, markup: 0, total: 0 },
        drafting: { cost: 0, markup: 0, total: 0 },
        engineering: { cost: 0, markup: 0, total: 0 },
        projectManagement: { hours: 0, rate: 60, total: 0 },
        shipping: { cost: 0, markup: 0, total: 0 }
      }
    }
  ]);

  // CSV Import State (Revu)
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importError, setImportError] = useState(null);
  const fileInputRef = useRef(null);
  const pricingCacheRef = useRef(new Map()); // sizeKey → getFabPricingForSize result

  // PDF Export State
  const [pdfExporting, setPdfExporting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef(null);

  // Custom fab operations from the admin-defined DB table
  const [customOps, setCustomOps] = useState([]);
  useEffect(() => { getCustomOps().then(setCustomOps).catch(() => {}); }, []);

  const customOpRateMap = useMemo(() => {
    const m = {};
    for (const op of customOps) m[op.name] = { rate: op.rate, unit: op.defaultUnit };
    return m;
  }, [customOps]);

  // Fetch pricing for a beam size, using an in-memory cache to avoid repeat server calls.
  const getPricingForSize = useCallback(async (rawSize) => {
    if (!rawSize) return null;
    const key = rawSize.replace(/\s+/g, '').replace(/x/g, 'X').toUpperCase();
    if (pricingCacheRef.current.has(key)) return pricingCacheRef.current.get(key);
    const pricing = await getFabPricingForSize(rawSize);
    pricingCacheRef.current.set(key, pricing); // cache null too (no entry in DB)
    return pricing;
  }, []);

  // Takeoff CSV Import State (Neilsoft 19-column)
  const [showTakeoffModal, setShowTakeoffModal] = useState(false);
  const [takeoffPreview, setTakeoffPreview] = useState(null);
  const [takeoffError, setTakeoffError] = useState(null);
  const [takeoffImporting, setTakeoffImporting] = useState(false);
  const takeoffFileInputRef = useRef(null);
  const isLoadedRef = useRef(false);      // blocks dirty tracking during initial load
  const autoSaveTimerRef = useRef(null);  // debounce timer handle
  const saveRef = useRef(null);           // always points to latest handleSave
  const [isDirty, setIsDirty] = useState(false);

  // ── LOAD PROJECT FROM DATABASE ──────────────────────────────────────────────
  const handleLoad = useCallback(async (id) => {
    isLoadedRef.current = false;
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) throw new Error('Failed to load project');
      const data = await res.json();

      setProjectStatus(data.status || 'DRAFT');
      setProjectName(data.projectName || '');
      setProjectAddress(data.projectAddress || '');
      setCustomerName(data.customerName || '');
      setCustomerId(data.customerId || null);
      setBillingAddress(data.billingAddress || '');
      setCustomerContact(data.customerContact || '');
      setCustomerPhone(data.customerPhone || '');
      setCustomerEmail(data.customerEmail || '');
      setEstimateDate(data.bidDate ? new Date(data.bidDate).toISOString().split('T')[0] : (data.estimateDate || ''));
      setBidTime(data.bidTime || '');
      setEstimatedBy(data.estimatedBy || '');
      setDrawingDate(data.drawingDate || '');
      setDrawingRevision(data.drawingRevision || '');
      setArchitect(data.architect || '');
      setEstimatorId(data.estimatorId || null);
      setDashboardStatus(data.dashboardStatus || '');
      setNewOrCo(data.newOrCo || '');
      setNotes(data.notes || '');

      setProjectTypes({
        structural: data.typeStructural || false,
        miscellaneous: data.typeMiscellaneous || false,
        ornamental: data.typeOrnamental || false,
      });

      setDeliveryOptions({
        installed: data.deliveryInstalled || false,
        fobJobsite: data.deliveryFobJobsite || false,
        willCall: data.deliveryWillCall || false,
      });

      setTaxCategory(data.taxCategory || null);

      const stdExc = (data.exclusions || []).filter(e => !e.isCustom).map(e => e.text);
      const custExc = (data.exclusions || []).filter(e => e.isCustom).map(e => e.text);
      setSelectedExclusions(stdExc);
      setCustomExclusions(custExc);

      const stdQual = (data.qualifications || []).filter(q => !q.isCustom).map(q => q.text);
      const custQual = (data.qualifications || []).filter(q => q.isCustom).map(q => q.text);
      setSelectedQualifications(stdQual);
      setCustomQualifications(custQual);

      setCustomProjectTypes((data.customProjectTypes || []).map(t => t.text));

      const custDeliv = data.customDeliveryOptions || [];
      setCustomDeliveryOptions(custDeliv.map(o => o.text));
      setSelectedCustomDelivery(custDeliv.find(o => o.isSelected)?.text || null);

      setBreakoutGroups((data.breakoutGroups || []).map(g => ({ id: g.id, name: g.name, type: g.type })));
      setAdjustments((data.adjustments || []).map(a => ({ id: a.id, description: a.description, amount: a.amount })));
      setCustomRecapColumns((data.customRecapColumns || []).map(c => ({ key: c.key, name: c.name })));

      if (data.items && data.items.length > 0) {
        const loadedItems = data.items.map(item => {
          const recapObj = {};
          (item.recapCosts || []).forEach(rc => {
            recapObj[rc.costType] = {
              cost: rc.cost || 0,
              markup: rc.markup || 0,
              total: rc.total || 0,
              hours: rc.hours || 0,
              rate: rc.rate || 0,
            };
          });
          if (!recapObj.installation) recapObj.installation = { cost: 0, markup: 0, total: 0 };
          if (!recapObj.drafting) recapObj.drafting = { cost: 0, markup: 0, total: 0 };
          if (!recapObj.engineering) recapObj.engineering = { cost: 0, markup: 0, total: 0 };
          if (!recapObj.projectManagement) recapObj.projectManagement = { hours: 0, rate: 60, total: 0 };
          if (!recapObj.shipping) recapObj.shipping = { cost: 0, markup: 0, total: 0 };

          return {
            id: item.id,
            itemNumber: item.itemNumber || '001',
            itemName: item.itemName || 'New Item',
            drawingRef: item.drawingRef || '',
            materialMarkup: item.materialMarkup || 0,
            fabMarkup: item.fabMarkup || 0,
            breakoutGroupId: item.breakoutGroupId || null,
            recapCosts: recapObj,
            materials: (item.materials || []).map(mat => ({
              id: mat.id,
              category: mat.category || '',
              shape: mat.shape || '',
              size: mat.shape || '',
              description: mat.description || '',
              length: mat.length || 0,
              pieces: mat.pieces || 0,
              stockLength: mat.stockLength || 0,
              stocksRequired: mat.stocksRequired || 0,
              waste: mat.waste || 0,
              weightPerFt: mat.weightPerFt || 0,
              fabWeight: mat.fabWeight || 0,
              stockWeight: mat.stockWeight || 0,
              pricePerFt: mat.pricePerFt || 0,
              pricePerLb: mat.pricePerLb || 0,
              totalCost: mat.totalCost || 0,
              galvanized: mat.galvanized || false,
              galvRate: mat.galvRate || 0,
              width: mat.width || null,
              thickness: mat.thickness || null,
              fabrication: (mat.fabrication || []).map(f => {
                const derivedRate = f.rate || (f.quantity > 0 && f.totalCost > 0 ? f.totalCost / f.quantity : 0);
                return {
                  id: f.id,
                  operation: f.operation || '',
                  quantity: f.quantity || 0,
                  unit: f.unit || 'ea',
                  rate: derivedRate,
                  unitPrice: derivedRate,
                  totalCost: f.totalCost || 0,
                  connWeight: f.connWeight || 0,
                  isGalvLine: f.isGalvLine || false,
                };
              }),
              children: (mat.children || []).map(child => ({
                id: child.id,
                category: child.category || '',
                shape: child.shape || '',
                size: child.shape || '',
                description: child.description || '',
                length: child.length || 0,
                pieces: child.pieces || 0,
                stockLength: child.stockLength || 0,
                stocksRequired: child.stocksRequired || 0,
                waste: child.waste || 0,
                weightPerFt: child.weightPerFt || 0,
                fabWeight: child.fabWeight || 0,
                stockWeight: child.stockWeight || 0,
                pricePerFt: child.pricePerFt || 0,
                pricePerLb: child.pricePerLb || 0,
                totalCost: child.totalCost || 0,
                galvanized: child.galvanized || false,
                galvRate: child.galvRate || 0,
                width: child.width || null,
                thickness: child.thickness || null,
                fabrication: (child.fabrication || []).map(f => {
                  const derivedRate = f.rate || (f.quantity > 0 && f.totalCost > 0 ? f.totalCost / f.quantity : 0);
                  return {
                    id: f.id,
                    operation: f.operation || '',
                    quantity: f.quantity || 0,
                    unit: f.unit || 'ea',
                    rate: derivedRate,
                    unitPrice: derivedRate,
                    totalCost: f.totalCost || 0,
                    connWeight: f.connWeight || 0,
                    isGalvLine: f.isGalvLine || false,
                  };
                }),
              })),
            })),
            fabrication: (item.fabrication || []).map(f => {
              const derivedRate = f.rate || (f.quantity > 0 && f.totalCost > 0 ? f.totalCost / f.quantity : 0);
              return {
                id: f.id,
                operation: f.operation || '',
                quantity: f.quantity || 0,
                unit: f.unit || 'ea',
                rate: derivedRate,
                unitPrice: derivedRate,
                totalCost: f.totalCost || 0,
              };
            }),
            snapshots: (item.snapshots || []).map(s => ({
              id: s.id,
              imageData: s.imageData || '',
              caption: s.caption || '',
              sortOrder: s.sortOrder || 0,
            })),
          };
        });
        setItems(loadedItems.map(item => ({ ...item, materials: resequenceMaterials(item.materials) })));
        const expanded = {};
        loadedItems.forEach(item => { expanded[item.id] = true; });
        setExpandedItems(expanded);
      }

      setCurrentProjectId(data.id);
      setTimeout(() => { isLoadedRef.current = true; }, 50);
    } catch (err) {
      console.error('Load error:', err);
      alert('Failed to load project. ' + err.message);
    }
  }, []);

  // ── SAVE PROJECT TO DATABASE ────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!currentProjectId) return;
    try {
      setSaveStatus('saving');
      const payload = {
        projectName,
        projectAddress,
        customerName,
        customerId: customerId || null,
        billingAddress,
        customerContact,
        customerPhone,
        customerEmail,
        estimateDate,
        bidDate: estimateDate ? new Date(estimateDate).toISOString() : null,
        bidTime: bidTime || '',
        estimatedBy,
        drawingDate,
        drawingRevision,
        architect,
        estimatorId: estimatorId || null,
        dashboardStatus: dashboardStatus || null,
        newOrCo: newOrCo || null,
        notes: notes || null,
        bidAmount: totals.grandTotal,
        typeStructural: projectTypes.structural,
        typeMiscellaneous: projectTypes.miscellaneous,
        typeOrnamental: projectTypes.ornamental,
        deliveryInstalled: deliveryOptions.installed,
        deliveryFobJobsite: deliveryOptions.fobJobsite,
        deliveryWillCall: deliveryOptions.willCall,
        taxCategory,
        breakoutGroups,
        items,
        adjustments,
        selectedExclusions,
        customExclusions,
        selectedQualifications,
        customQualifications,
        customRecapColumns,
        customProjectTypes,
        customDeliveryOptions: customDeliveryOptions.map(opt => ({
          text: opt,
          isSelected: selectedCustomDelivery === opt,
        })),
      };

      const res = await fetch(`/api/projects/${currentProjectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Save failed');
      }

      setSaveStatus('saved');
      setIsDirty(false);
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      console.error('Save error:', err);
      setSaveStatus('error');
      alert('Failed to save project. ' + err.message);
      setTimeout(() => setSaveStatus(null), 3000);
    }
  }, [currentProjectId, projectName, projectAddress, customerName, customerId, billingAddress, customerContact, customerPhone, customerEmail, estimateDate, bidTime, estimatedBy, drawingDate, drawingRevision, architect, estimatorId, dashboardStatus, newOrCo, notes, projectTypes, deliveryOptions, taxCategory, breakoutGroups, items, adjustments, selectedExclusions, customExclusions, selectedQualifications, customQualifications, customRecapColumns, customProjectTypes, customDeliveryOptions, selectedCustomDelivery]);

  // Keep saveRef pointing at the latest handleSave closure (no deps — runs every render)
  useEffect(() => { saveRef.current = handleSave; });

  // Dirty-tracking autosave: fires 3 s after any data change; skips during load hydration
  useEffect(() => {
    if (!isLoadedRef.current) return;
    setIsDirty(true);
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      saveRef.current?.();
    }, 3000);
    return () => clearTimeout(autoSaveTimerRef.current);
  }, [
    projectName, projectAddress, customerName, customerId, billingAddress,
    customerContact, customerPhone, customerEmail, estimateDate,
    bidTime, estimatedBy, drawingDate, drawingRevision, architect,
    estimatorId, dashboardStatus, newOrCo, notes,
    projectTypes, deliveryOptions, taxCategory,
    breakoutGroups, items, adjustments,
    selectedExclusions, customExclusions,
    selectedQualifications, customQualifications,
    customRecapColumns,
    customProjectTypes, customDeliveryOptions, selectedCustomDelivery,
  ]);

  const handleStatusChange = useCallback(async (newStatus) => {
    if (!currentProjectId) return;
    const messages = {
      IN_REVIEW: 'Submit this estimate for review?',
      PUBLISHED: 'Are you sure you want to publish this estimate? It will become visible to Project Managers and Viewers.',
      REOPENED: 'This will hide the estimate from Viewers until it is re-published. Continue?',
      DRAFT: projectStatus === 'IN_REVIEW'
        ? 'Recall this submission? The estimate will return to Draft status.'
        : 'Reset this estimate back to Draft status?',
    };
    if (!confirm(messages[newStatus] || `Change status to ${newStatus}?`)) return;
    await saveRef.current?.();   // save any pending edits before changing status
    setStatusChanging(true);
    try {
      const res = await fetch(`/api/projects/${currentProjectId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const result = await res.json();
        setProjectStatus(result.status);
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to update status');
      }
    } catch (err) {
      alert('Failed to update status');
    } finally {
      setStatusChanging(false);
    }
  }, [currentProjectId]);

  const canEdit = userRole === 'ADMIN' || (userRole === 'ESTIMATOR' && (projectStatus === 'DRAFT' || projectStatus === 'IN_REVIEW' || projectStatus === 'REOPENED'));
  const isReadOnly = !canEdit;

  // ── LOAD ON MOUNT ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (projectId) {
      handleLoad(projectId);
    }
  }, [projectId, handleLoad]);

  useEffect(() => {
    fetch('/api/dashboard/users')
      .then(r => r.ok ? r.json() : [])
      .then(list => setUsersList(list))
      .catch(() => {});
  }, []);

  // Toggle exclusion
  const toggleExclusion = (exclusion) => {
    setSelectedExclusions(prev =>
      prev.includes(exclusion) ? prev.filter(e => e !== exclusion) : [...prev, exclusion]
    );
  };

  // Add custom exclusion
  const addCustomExclusion = () => {
    if (newCustomExclusion.trim() && !customExclusions.includes(newCustomExclusion.trim())) {
      setCustomExclusions([...customExclusions, newCustomExclusion.trim()]);
      setNewCustomExclusion('');
    }
  };

  // Remove custom exclusion
  const removeCustomExclusion = (exclusion) => {
    setCustomExclusions(customExclusions.filter(e => e !== exclusion));
  };

  // Toggle qualification
  const toggleQualification = (qual) => {
    setSelectedQualifications(prev =>
      prev.includes(qual) ? prev.filter(q => q !== qual) : [...prev, qual]
    );
  };

  // Add custom qualification
  const addCustomQualification = () => {
    if (newCustomQualification.trim() && !customQualifications.includes(newCustomQualification.trim())) {
      setCustomQualifications([...customQualifications, newCustomQualification.trim()]);
      setNewCustomQualification('');
    }
  };

  // Remove custom qualification
  const removeCustomQualification = (qual) => {
    setCustomQualifications(customQualifications.filter(q => q !== qual));
  };

  // Custom project types
  const addCustomProjectType = () => {
    const v = newCustomProjectType.trim();
    if (v && !customProjectTypes.includes(v)) {
      setCustomProjectTypes([...customProjectTypes, v]);
      setNewCustomProjectType('');
    }
  };
  const removeCustomProjectType = (t) => setCustomProjectTypes(customProjectTypes.filter(x => x !== t));

  // Custom delivery options
  const addCustomDeliveryOption = () => {
    const v = newCustomDeliveryOption.trim();
    if (v && !customDeliveryOptions.includes(v)) {
      setCustomDeliveryOptions([...customDeliveryOptions, v]);
      setNewCustomDeliveryOption('');
    }
  };
  const removeCustomDeliveryOption = (opt) => {
    setCustomDeliveryOptions(customDeliveryOptions.filter(x => x !== opt));
    if (selectedCustomDelivery === opt) setSelectedCustomDelivery(null);
  };
  const selectCustomDelivery = (opt) => {
    setDeliveryOptions({ installed: false, fobJobsite: false, willCall: false });
    setSelectedCustomDelivery(opt);
  };

  // Breakout Group functions
  const addBreakoutGroup = () => {
    const newGroup = {
      id: Date.now(),
      name: '',
      type: 'base' // base, deduct, add
    };
    setBreakoutGroups([...breakoutGroups, newGroup]);
  };

  const updateBreakoutGroup = (groupId, field, value) => {
    setBreakoutGroups(breakoutGroups.map(g => g.id === groupId ? { ...g, [field]: value } : g));
  };

  const deleteBreakoutGroup = (groupId) => {
    // Unassign items from this group
    setItems(items.map(item => item.breakoutGroupId === groupId ? { ...item, breakoutGroupId: null } : item));
    setBreakoutGroups(breakoutGroups.filter(g => g.id !== groupId));
  };

  // Calculate item total
  const getItemTotal = (item) => {
    const matCost = item.materials.reduce((s, m) => s + (m.totalCost || 0), 0);
    // Include material-level fab costs
    const matFabCost = item.materials.reduce((s, m) => {
      return s + (m.fabrication ? m.fabrication.reduce((fs, f) => fs + (f.totalCost || 0), 0) : 0);
    }, 0);
    // Plus item-level fab costs
    const itemFabCost = item.fabrication.reduce((s, f) => s + (f.totalCost || 0), 0);
    const totalFabCost = matFabCost + itemFabCost;
    // Apply separate markups to material and fab costs
    const markedUpMatCost = matCost * (1 + (item.materialMarkup || 0) / 100);
    const markedUpFabCost = totalFabCost * (1 + (item.fabMarkup || 0) / 100);
    // Add recap costs (not marked up)
    const recapCost = Object.values(item.recapCosts).reduce((s, c) => s + (c.total || 0), 0);
    return markedUpMatCost + markedUpFabCost + recapCost;
  };

  // Calculate breakout totals
  const calculateBreakoutTotals = () => {
    const result = {
      baseBid: 0,
      deducts: [],
      adds: []
    };

    // Get items with no group or base group - these are always in base bid
    items.forEach(item => {
      const itemTotal = getItemTotal(item);
      const group = breakoutGroups.find(g => g.id === item.breakoutGroupId);
      
      if (!group || group.type === 'base') {
        result.baseBid += itemTotal;
      } else if (group.type === 'deduct') {
        // Deducts are included in base bid but shown as options
        result.baseBid += itemTotal;
      }
      // Add items are NOT included in base bid
    });

    // Add adjustments to base bid (internal - baked in but not shown separately on quote)
    const totalAdjustments = adjustments.reduce((sum, adj) => sum + (parseFloat(adj.amount) || 0), 0);
    result.baseBid += totalAdjustments;

    // Calculate deduct totals
    breakoutGroups.filter(g => g.type === 'deduct').forEach(group => {
      const groupItems = items.filter(i => i.breakoutGroupId === group.id);
      const total = groupItems.reduce((s, i) => s + getItemTotal(i), 0);
      if (total > 0) {
        result.deducts.push({ ...group, total, items: groupItems });
      }
    });

    // Calculate add totals
    breakoutGroups.filter(g => g.type === 'add').forEach(group => {
      const groupItems = items.filter(i => i.breakoutGroupId === group.id);
      const total = groupItems.reduce((s, i) => s + getItemTotal(i), 0);
      if (total > 0) {
        result.adds.push({ ...group, total, items: groupItems });
      }
    });

    return result;
  };

  // Memoized breakout totals to avoid recalculating on every render
  const breakoutTotals = useMemo(() => calculateBreakoutTotals(), [items, breakoutGroups, adjustments]);

  // Adjustment functions
  const addAdjustment = () => {
    const newAdj = {
      id: Date.now(),
      amount: 0,
      note: ''
    };
    setAdjustments([...adjustments, newAdj]);
  };

  const updateAdjustment = (adjId, field, value) => {
    setAdjustments(adjustments.map(a => a.id === adjId ? { ...a, [field]: value } : a));
  };

  const deleteAdjustment = (adjId) => {
    setAdjustments(adjustments.filter(a => a.id !== adjId));
  };

  const getTotalAdjustments = () => {
    return adjustments.reduce((sum, adj) => sum + (parseFloat(adj.amount) || 0), 0);
  };

  // Get shapes for a category
  const getShapesForCategory = (category) => {
    const shapes = Object.keys(steelDatabase).filter(shape => steelDatabase[shape].category === category);
    if (category === 'Round Bar') {
      const parseDia = (name) => {
        const diaStr = name.split(' ')[1] || '0';
        const dash = diaStr.indexOf('-');
        if (dash === -1) {
          const slash = diaStr.indexOf('/');
          if (slash === -1) return parseFloat(diaStr);
          return parseFloat(diaStr.slice(0, slash)) / parseFloat(diaStr.slice(slash + 1));
        }
        const whole = parseFloat(diaStr.slice(0, dash));
        const [num, den] = diaStr.slice(dash + 1).split('/').map(Number);
        return whole + num / den;
      };
      return shapes.sort((a, b) => parseDia(a) - parseDia(b));
    }
    if (category === 'Pipe') {
      // Parse 'PIPE 1-1/2 STD' -> numeric diameter (1.5) for sorting
      const parseDia = (name) => {
        const diaStr = name.split(' ')[1] || '0';
        const dash = diaStr.indexOf('-');
        if (dash === -1) return parseFloat(diaStr);
        const whole = parseFloat(diaStr.slice(0, dash));
        const [num, den] = diaStr.slice(dash + 1).split('/').map(Number);
        return whole + num / den;
      };
      const gradeOrder = { STD: 0, XS: 1, XXS: 2 };
      return shapes.sort((a, b) => {
        const dDiff = parseDia(a) - parseDia(b);
        if (dDiff !== 0) return dDiff;
        return (gradeOrder[a.split(' ')[2]] ?? 99) - (gradeOrder[b.split(' ')[2]] ?? 99);
      });
    }
    return shapes;
  };

  // Calculate material values
  const calculateMaterial = (material) => {
    const steelData = steelDatabase[material.size];
    
    // Calculate weight per foot based on category
    let weightPerFoot;
    let displaySize = material.size;
    
    if (material.category === 'Plate' && material.plateThickness && material.plateWidth) {
      // Plate: calculate from thickness × width
      weightPerFoot = calcPlateWeightPerFoot(parseFloat(material.plateThickness), material.plateWidth);
      // Find thickness label for display
      const thicknessInfo = plateThicknesses.find(t => t.value === parseFloat(material.plateThickness));
      const thickLabel = thicknessInfo ? thicknessInfo.label : material.plateThickness + '"';
      displaySize = `PL ${thickLabel} × ${material.plateWidth}"`;
    } else if (material.customWeight) {
      weightPerFoot = material.customWeight;
    } else {
      weightPerFoot = steelData ? steelData.weight : 0;
    }
    
    const totalLength = (material.pieces || 0) * (material.length || 0);
    const fabWeight = totalLength * weightPerFoot;
    
    // Get available stock lengths for this category
    const availableStockLengths = getStockLengthsForCategory(material.category);
    
    // Calculate optimal nesting
    const optimization = calculateOptimalStock(material.pieces, material.length, availableStockLengths);
    
    // Use manual stockLength if set and valid, otherwise use optimal
    let stockLen = material.stockLength;
    let isManualOverride = false;
    
    // Validate stockLength is available for this category
    if (!stockLen || !availableStockLengths.includes(stockLen)) {
      stockLen = optimization.optimalLength;
    } else if (stockLen !== optimization.optimalLength) {
      isManualOverride = true;
    }
    
    // Calculate stocks required with the selected stock length
    let stocksRequired = 0;
    let stockWeight = fabWeight;
    let piecesPerStock = 0;
    let wasteLength = 0;
    let efficiency = 0;
    
    if (material.pieces > 0 && material.length > 0 && stockLen >= material.length) {
      piecesPerStock = Math.floor(stockLen / material.length);
      stocksRequired = Math.ceil(material.pieces / piecesPerStock);
      stockWeight = stocksRequired * stockLen * weightPerFoot;
      const totalStockLength = stocksRequired * stockLen;
      wasteLength = totalStockLength - totalLength;
      efficiency = (totalLength / totalStockLength) * 100;
    }
    
    let totalCost = 0;
    const unitPrice = material.unitPrice || 0;
    if (material.priceBy === 'LB') {
      totalCost = stockWeight * unitPrice;
    } else if (material.priceBy === 'LF') {
      totalCost = (stocksRequired * stockLen) * unitPrice;
    } else if (material.priceBy === 'EA') {
      totalCost = material.pieces * unitPrice;
    }
    
    // Auto-generate description for Plate if not manually set
    const description = material.category === 'Plate' && (!material.description || material.description.startsWith('PL '))
      ? displaySize
      : material.description;
    
    return { 
      ...material, 
      description: description || material.description,
      size: material.category === 'Plate' ? displaySize : material.size,
      weightPerFoot, 
      totalLength, 
      fabWeight, 
      stockLength: stockLen,
      optimalStockLength: optimization.optimalLength,
      isManualOverride,
      stocksRequired, 
      stockWeight, 
      piecesPerStock,
      wasteLength,
      efficiency,
      totalCost 
    };
  };

  // CSV Import Functions
  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      processCSVContent(content);
    };
    reader.onerror = () => {
      setImportError('Failed to read file');
    };
    reader.readAsText(file);
    
    // Reset file input so same file can be selected again
    event.target.value = '';
  };

  const processCSVContent = (content) => {
    setImportError(null);
    
    // Parse CSV
    const parseResult = parseRevuCSV(content);
    
    if (parseResult.error) {
      setImportError(parseResult.error);
      setImportPreview(null);
      setShowImportModal(true);
      return;
    }
    
    if (parseResult.rows.length === 0) {
      setImportError('No valid material rows found. Ensure rows have Mat Size and Fab Length values.');
      setImportPreview(null);
      setShowImportModal(true);
      return;
    }
    
    // Aggregate data
    const aggregated = aggregateImportData(parseResult.rows);
    
    setImportPreview(aggregated);
    setShowImportModal(true);
  };

  const executeImport = () => {
    if (!importPreview || !importPreview.items) return;
    
    let updatedItems = [...items];
    let newExpandedItems = { ...expandedItems };
    
    for (const importItem of importPreview.items) {
      // Find existing item by item number
      const existingIndex = updatedItems.findIndex(
        item => item.itemNumber === importItem.itemNumber
      );
      
      if (existingIndex !== -1) {
        // Update existing item (merge logic)
        const existingItem = updatedItems[existingIndex];
        let updatedMaterials = [...existingItem.materials];
        
        for (const importMat of importItem.materials) {
          // Find matching material line
          const matIndex = updatedMaterials.findIndex(
            m => m.size === importMat.size && 
                 m.length === importMat.length && 
                 m.description === importMat.description
          );
          
          if (matIndex !== -1) {
            // Replace quantity (preserve prices)
            updatedMaterials[matIndex] = calculateMaterial({
              ...updatedMaterials[matIndex],
              pieces: importMat.pieces
            });
          } else {
            // Add new material line with sequence
            const nextSeq = getNextParentSequence(updatedMaterials);
            const newMat = {
              id: Date.now() + Math.random(),
              sequence: nextSeq,
              parentMaterialId: null,
              description: importMat.description,
              category: importMat.category,
              size: importMat.size,
              customWeight: importMat.category === 'Custom' ? 0 : null,
              pieces: importMat.pieces,
              length: importMat.length,
              stockLength: null,
              priceBy: 'LB',
              unitPrice: 0,
              galvanized: false,
              fabrication: []
            };
            updatedMaterials.push(calculateMaterial(newMat));
          }
        }
        
        // Append drawing references
        let drawingRefs = existingItem.drawingRef ? existingItem.drawingRef.split(',').map(s => s.trim()) : [];
        const newRefs = importItem.drawingRef ? importItem.drawingRef.split(',').map(s => s.trim()) : [];
        for (const ref of newRefs) {
          if (ref && !drawingRefs.includes(ref)) {
            drawingRefs.push(ref);
          }
        }
        drawingRefs.sort((a, b) => parseInt(a) - parseInt(b));
        
        updatedItems[existingIndex] = {
          ...existingItem,
          itemName: existingItem.itemName === 'New Item' ? importItem.itemName : existingItem.itemName,
          drawingRef: drawingRefs.join(', '),
          materials: updatedMaterials
        };
        
        // Expand updated item
        newExpandedItems[existingItem.id] = true;
        
      } else {
        // Create new item with sequenced materials
        const newId = Date.now() + Math.random();
        let seqIndex = 0;
        const newMaterials = importItem.materials.map(mat => {
          const seq = String.fromCharCode(65 + seqIndex); // A, B, C...
          seqIndex++;
          const newMat = {
            id: Date.now() + Math.random(),
            sequence: seq,
            parentMaterialId: null,
            description: mat.description,
            category: mat.category,
            size: mat.size,
            customWeight: mat.category === 'Custom' ? 0 : null,
            pieces: mat.pieces,
            length: mat.length,
            stockLength: null,
            priceBy: 'LB',
            unitPrice: 0,
            galvanized: false,
            fabrication: []
          };
          return calculateMaterial(newMat);
        });
        
        const newItem = {
          id: newId,
          itemNumber: importItem.itemNumber,
          itemName: importItem.itemName,
          drawingRef: importItem.drawingRef,
          breakoutGroupId: null,
          materialMarkup: 0, // Material markup percentage
          fabMarkup: 0, // Fabrication markup percentage
          materials: newMaterials,
          fabrication: [],
          recapCosts: {
            installation: { cost: 0, markup: 0, total: 0 },
            drafting: { cost: 0, markup: 0, total: 0 },
            engineering: { cost: 0, markup: 0, total: 0 },
            projectManagement: { hours: 0, rate: 60, total: 0 },
            shipping: { cost: 0, markup: 0, total: 0 }
          }
        };
        
        updatedItems.push(newItem);
        newExpandedItems[newId] = true;
      }
    }
    
    // Sort items by item number
    updatedItems.sort((a, b) => a.itemNumber.localeCompare(b.itemNumber, undefined, { numeric: true }));

    setItems(updatedItems.map(item => ({ ...item, materials: resequenceMaterials(item.materials) })));
    setExpandedItems(newExpandedItems);
    setShowImportModal(false);
    setImportPreview(null);
    setImportError(null);
  };

  const cancelImport = () => {
    setShowImportModal(false);
    setImportPreview(null);
    setImportError(null);
  };

  // ── TAKEOFF CSV IMPORT (Neilsoft 19-column) ─────────────────────────────────

  const handleTakeoffFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = '';

    setTakeoffImporting(true);
    setTakeoffError(null);
    setTakeoffPreview(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/import-csv', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setTakeoffError(data.error || 'Failed to process CSV file');
        setTakeoffPreview(null);
      } else {
        setTakeoffPreview(data);
        setTakeoffError(null);
      }
    } catch (err) {
      setTakeoffError('Network error: ' + err.message);
      setTakeoffPreview(null);
    } finally {
      setTakeoffImporting(false);
      setShowTakeoffModal(true);
    }
  };

  const cancelTakeoffImport = () => {
    setShowTakeoffModal(false);
    setTakeoffPreview(null);
    setTakeoffError(null);
  };

  const executeTakeoffImport = () => {
    if (!takeoffPreview || !takeoffPreview.items) return;

    let updatedItems = [...items];
    let newExpandedItems = { ...expandedItems };

    for (const importItem of takeoffPreview.items) {
      // Build flat materials list from all members (parents first, then children)
      const flatMaterials = [];
      let seqIndex = 0;
      const parentIdMap = new Map(); // mark -> generated material id

      const processMember = (member, parentMaterialId) => {
        const translated = translateSizeToAISC(member.size);
        const seq = String.fromCharCode(65 + seqIndex);
        seqIndex++;

        const matId = Date.now() + Math.random();
        const newMat = {
          id: matId,
          sequence: seq,
          parentMaterialId: parentMaterialId || null,
          description: member.description || translated.size || member.size,
          category: translated.category,
          size: translated.size || member.size,
          customWeight: translated.category === 'Custom' ? 0 : null,
          pieces: member.pieces || 1,
          length: member.length || 0,
          stockLength: null,
          priceBy: 'LB',
          unitPrice: 0,
          galvanized: member.galvanized || false,
          // Plate dimensions — dual fields: frontend calc + DB save
          plateThickness: translated.plateThickness || null,
          plateWidth: translated.plateWidth || null,
          thickness: translated.plateThickness || null,
          width: translated.plateWidth || null,
          fabrication: (member.fabrication || []).map(op => {
            const qty = op.quantity || 0;
            const rate = op.rate || 0;
            const connWeight = op.connWeight || null;
            return {
              id: Date.now() + Math.random(),
              operation: op.operation,
              quantity: qty,
              unit: op.unit || 'EA',
              length: null,
              unitPrice: rate,
              totalCost: qty * rate,
              connWeight,
              galvanized: false,
              galvWeight: null,
              isGalvLine: false,
            };
          }),
        };
        flatMaterials.push(calculateMaterial(newMat));
        parentIdMap.set(member.mark, matId);

        // Process children
        if (member.children && member.children.length > 0) {
          for (const child of member.children) {
            processMember(child, matId);
          }
        }
      };

      for (const member of importItem.members) {
        processMember(member, null);
      }

      // Build item-level fabrication (uniform coating)
      const itemFab = [];
      if (importItem.coatingUniform) {
        itemFab.push({
          id: Date.now() + Math.random(),
          operation: importItem.coatingUniform,
          quantity: 1,
          unit: 'EA',
          length: null,
          unitPrice: 0,
          totalCost: 0,
          connWeight: null,
          galvanized: false,
          galvWeight: null,
          isGalvLine: false,
        });
      }

      // Find or create item
      const existingIndex = updatedItems.findIndex(
        item => item.itemNumber === importItem.itemNumber
      );

      if (existingIndex !== -1) {
        const existingItem = updatedItems[existingIndex];
        let updatedMaterials = [...existingItem.materials];

        // Add only non-duplicate materials
        for (const mat of flatMaterials) {
          const exists = updatedMaterials.some(
            m => m.size === mat.size &&
                 m.length === mat.length &&
                 m.description === mat.description
          );
          if (!exists) {
            updatedMaterials.push({ ...mat, fabrication: (mat.fabrication || []).map(f => ({ ...f })) });
          }
        }

        // Merge item-level fab ops (no duplicates)
        let updatedFab = [...(existingItem.fabrication || [])];
        for (const op of itemFab) {
          const exists = updatedFab.some(f => f.operation === op.operation);
          if (!exists) updatedFab.push({ ...op });
        }

        updatedItems[existingIndex] = {
          ...existingItem,
          itemName: existingItem.itemName === 'New Item' ? importItem.itemName : existingItem.itemName,
          drawingRef: (() => {
            const existing = existingItem.drawingRef ? existingItem.drawingRef.split(',').map(s => s.trim()) : [];
            const incoming = importItem.drawingRef ? importItem.drawingRef.split(',').map(s => s.trim()) : [];
            const merged = [...new Set([...existing, ...incoming].filter(Boolean))];
            return merged.join(', ');
          })(),
          materials: updatedMaterials,
          fabrication: updatedFab,
        };
        newExpandedItems[existingItem.id] = true;

      } else {
        const newId = Date.now() + Math.random();
        const newItem = {
          id: newId,
          itemNumber: importItem.itemNumber,
          itemName: importItem.itemName,
          drawingRef: importItem.drawingRef,
          breakoutGroupId: null,
          materialMarkup: 0,
          fabMarkup: 0,
          materials: flatMaterials,
          fabrication: itemFab,
          recapCosts: {
            installation: { cost: 0, markup: 0, total: 0 },
            drafting: { cost: 0, markup: 0, total: 0 },
            engineering: { cost: 0, markup: 0, total: 0 },
            projectManagement: { hours: 0, rate: 60, total: 0 },
            shipping: { cost: 0, markup: 0, total: 0 },
          },
        };
        updatedItems.push(newItem);
        newExpandedItems[newId] = true;
      }
    }

    // Sort items numerically
    updatedItems.sort((a, b) =>
      a.itemNumber.localeCompare(b.itemNumber, undefined, { numeric: true })
    );

    setItems(updatedItems);
    setExpandedItems(newExpandedItems);
    setShowTakeoffModal(false);
    setTakeoffPreview(null);
    setTakeoffError(null);
  };

  // Item functions
  const addItem = () => {
    const newId = Date.now();
    const newItem = {
      id: newId,
      itemNumber: String(items.length + 1).padStart(3, '0'),
      itemName: 'New Item',
      drawingRef: '',
      breakoutGroupId: null,
      materialMarkup: 0, // Material markup percentage
      fabMarkup: 0, // Fabrication markup percentage
      materials: [],
      fabrication: [],
      recapCosts: {
        installation: { cost: 0, markup: 0, total: 0 },
        drafting: { cost: 0, markup: 0, total: 0 },
        engineering: { cost: 0, markup: 0, total: 0 },
        projectManagement: { hours: 0, rate: 60, total: 0 },
        shipping: { cost: 0, markup: 0, total: 0 }
      },
      snapshots: [],
    };
    setItems([...items, newItem]);
    setExpandedItems({ ...expandedItems, [newId]: true });
  };

  const deleteItem = (itemId) => {
    setItems(items.filter(item => item.id !== itemId));
  };

  const updateItem = (itemId, field, value) => {
    setItems(items.map(item => item.id === itemId ? { ...item, [field]: value } : item));
  };

  const toggleItemExpansion = (itemId) => {
    setExpandedItems({ ...expandedItems, [itemId]: !expandedItems[itemId] });
  };

  // Material functions
  // Get next parent sequence letter (A, B, C, ...)
  const getNextParentSequence = (materials) => {
    const parentSeqs = materials
      .filter(m => !m.parentMaterialId)
      .map(m => m.sequence)
      .filter(s => s && /^[A-Z]$/.test(s));
    if (parentSeqs.length === 0) return 'A';
    const maxChar = parentSeqs.sort().pop();
    return String.fromCharCode(maxChar.charCodeAt(0) + 1);
  };

  // Get next child sequence (A1, A2, ...)
  const getNextChildSequence = (materials, parentId) => {
    const parent = materials.find(m => m.id === parentId);
    if (!parent) return 'A1';
    const parentSeq = parent.sequence || 'A';
    const childSeqs = materials
      .filter(m => m.parentMaterialId === parentId)
      .map(m => m.sequence)
      .filter(s => s && s.startsWith(parentSeq))
      .map(s => parseInt(s.slice(1)) || 0);
    const nextNum = childSeqs.length === 0 ? 1 : Math.max(...childSeqs) + 1;
    return `${parentSeq}${nextNum}`;
  };

  // Get children of a parent material
  const getChildMaterials = (materials, parentId) => {
    return materials.filter(m => m.parentMaterialId === parentId);
  };

  // Get parent materials only
  const getParentMaterials = (materials) => {
    return materials.filter(m => !m.parentMaterialId);
  };

  // Re-sequence materials: assigns A,B,C to parents and A1,A2,B1,B2 to children
  // Also rebuilds array in normalized order (parent → children → parent → children)
  const resequenceMaterials = (materials) => {
    const parents = materials.filter(m => !m.parentMaterialId);
    const result = [];
    parents.forEach((parent, idx) => {
      const letter = String.fromCharCode(65 + idx); // A=65
      result.push({ ...parent, sequence: letter });
      const children = materials.filter(m => m.parentMaterialId === parent.id);
      children.forEach((child, childIdx) => {
        result.push({ ...child, sequence: `${letter}${childIdx + 1}` });
      });
    });
    return result;
  };

  const addMaterial = (itemId) => {
    setItems(items.map(item => {
      if (item.id !== itemId) return item;
      const nextSeq = getNextParentSequence(item.materials);
      const newMaterial = {
        id: Date.now() + Math.random(),
        sequence: nextSeq,
        parentMaterialId: null, // This is a parent material
        description: '',
        category: 'W Shape',
        size: 'W18x35',
        customWeight: null,
        pieces: 1,
        length: 20,
        stockLength: null,
        priceBy: 'LB',
        unitPrice: 0,
        galvanized: false,
        fabrication: [] // Nested fabrication for this material
      };
      return { ...item, materials: [...item.materials, calculateMaterial(newMaterial)] };
    }));
  };

  // Add child material (attachment) to a parent
  const addChildMaterial = (itemId, parentMaterialId) => {
    setItems(items.map(item => {
      if (item.id !== itemId) return item;
      const parent = item.materials.find(m => m.id === parentMaterialId);
      if (!parent) return item;
      
      const nextSeq = getNextChildSequence(item.materials, parentMaterialId);
      const newMaterial = {
        id: Date.now() + Math.random(),
        sequence: nextSeq,
        parentMaterialId: parentMaterialId,
        description: '',
        category: 'Plate',
        size: '',
        plateThickness: 0.5,
        plateWidth: 6,
        thickness: 0.5,
        width: 6,
        customWeight: null,
        pieces: parent.pieces || 1, // Inherit from parent
        inheritPieces: true, // Flag to inherit piece count
        length: 1,
        stockLength: null,
        priceBy: 'LB',
        unitPrice: 0,
        galvanized: false,
        fabrication: [] // Nested fabrication for this material
      };
      return { ...item, materials: [...item.materials, calculateMaterial(newMaterial)] };
    }));
  };

  const updateMaterial = (itemId, materialId, field, value) => {
    setItems(items.map(item => {
      if (item.id === itemId) {
        let updatedMaterials = item.materials.map(mat => {
          if (mat.id === materialId) {
            let updated = { ...mat, [field]: value };
            if (field === 'category') {
              const shapes = getShapesForCategory(value);
              updated.size = shapes.length > 0 ? shapes[0] : '';
              updated.customWeight = null;
              updated.stockLength = null; // Reset to auto-calculate for new category
            }
            // If child material changes pieces, turn off inheritance
            if (field === 'pieces' && mat.parentMaterialId) {
              updated.inheritPieces = false;
            }
            
            // Calculate material first to get fabWeight
            updated = calculateMaterial(updated);
            
            // Handle galvanizing automation (now in material.fabrication)
            let matFab = [...(updated.fabrication || [])];
            
            if (field === 'galvanized') {
              const galvFabIndex = matFab.findIndex(f => f.isAutoGalv);
              
              if (value === true) {
                // Add galvanizing fabrication to this material
                if (galvFabIndex === -1) {
                  matFab.push({
                    id: Date.now(),
                    operation: 'Galvanizing',
                    connectTo: 'apply',
                    description: `Galv - ${updated.description || updated.size}`,
                    quantity: updated.fabWeight || 0,
                    unit: 'LB',
                    unitPrice: 0,
                    multiplyByPieces: false, // Weight already includes pieces
                    totalCost: 0,
                    isAutoGalv: true
                  });
                }
              } else {
                // Remove galvanizing fabrication
                if (galvFabIndex !== -1) {
                  matFab.splice(galvFabIndex, 1);
                }
              }
            } else if (['pieces', 'length', 'size', 'customWeight', 'category', 'description', 'plateThickness', 'plateWidth'].includes(field)) {
              // Update galvanizing qty if material weight changes and galv is enabled
              if (updated.galvanized) {
                const galvFabIndex = matFab.findIndex(f => f.isAutoGalv);
                if (galvFabIndex !== -1) {
                  matFab[galvFabIndex] = {
                    ...matFab[galvFabIndex],
                    quantity: updated.fabWeight || 0,
                    description: `Galv - ${updated.description || updated.size}`,
                    totalCost: (updated.fabWeight || 0) * (matFab[galvFabIndex].unitPrice || 0)
                  };
                }
              }
              
              // Update connection weights when size or category changes
              if (field === 'size' || field === 'category') {
                matFab = matFab.map(fab => {
                  if (CONNECTION_WEIGHT_OPS.has(fab.operation)) {
                    const newConnWeight = getConnectionWeight(updated.size, updated.category);
                    const qty = fab.quantity || 0;
                    const rate = fab.unitPrice || 0;
                    const newGalvWeight = fab.galvanized ? qty * newConnWeight : null;
                    // If unit is LB, multiply by connWeight; if EA, just qty × rate
                    const newTotal = fab.unit === 'LB' ? qty * newConnWeight * rate : qty * rate;
                    return { 
                      ...fab, 
                      connWeight: newConnWeight,
                      galvWeight: newGalvWeight,
                      totalCost: newTotal
                    };
                  }
                  // Update linked connection galv line
                  if (fab.isConnGalv && fab.parentFabId) {
                    const parentFab = matFab.find(f => f.id === fab.parentFabId);
                    if (parentFab && parentFab.galvWeight) {
                      return {
                        ...fab,
                        quantity: parentFab.galvWeight,
                        totalCost: parentFab.galvWeight * (fab.unitPrice || 0)
                      };
                    }
                  }
                  return fab;
                });
                
                // Second pass to update galv lines with new parent galvWeight
                matFab = matFab.map(fab => {
                  if (fab.isConnGalv && fab.parentFabId) {
                    const parentFab = matFab.find(f => f.id === fab.parentFabId);
                    if (parentFab) {
                      const newQty = parentFab.galvWeight || 0;
                      return {
                        ...fab,
                        quantity: newQty,
                        totalCost: newQty * (fab.unitPrice || 0)
                      };
                    }
                  }
                  return fab;
                });
              }
              
              // Recalculate all material fab totals when pieces change
              if (field === 'pieces') {
                matFab = matFab.map(fab => {
                  if (fab.isAutoGalv) return fab; // Galv already handled
                  const baseQty = fab.quantity || 0;
                  const finalQty = fab.multiplyByPieces ? baseQty * (updated.pieces || 1) : baseQty;
                  return { ...fab, totalCost: finalQty * (fab.unitPrice || 0) };
                });
              }
            }
            
            updated.fabrication = matFab;
            return updated;
          }
          return mat;
        });
        
        // If parent pieces changed, update children with inheritPieces=true
        const updatedMat = updatedMaterials.find(m => m.id === materialId);
        if (field === 'pieces' && updatedMat && !updatedMat.parentMaterialId) {
          updatedMaterials = updatedMaterials.map(mat => {
            if (mat.parentMaterialId === materialId && mat.inheritPieces) {
              let childUpdated = calculateMaterial({ ...mat, pieces: value });
              // Recalculate child fab totals
              if (childUpdated.fabrication) {
                childUpdated.fabrication = childUpdated.fabrication.map(fab => {
                  if (fab.isAutoGalv) {
                    // Update galv weight
                    return { ...fab, quantity: childUpdated.fabWeight || 0, totalCost: (childUpdated.fabWeight || 0) * (fab.unitPrice || 0) };
                  }
                  const baseQty = fab.quantity || 0;
                  const finalQty = fab.multiplyByPieces ? baseQty * (childUpdated.pieces || 1) : baseQty;
                  return { ...fab, totalCost: finalQty * (fab.unitPrice || 0) };
                });
              }
              return childUpdated;
            }
            return mat;
          });
        }
        
        return { ...item, materials: updatedMaterials };
      }
      return item;
    }));
  };

  const deleteMaterial = (itemId, materialId) => {
    setItems(items.map(item => {
      if (item.id === itemId) {
        // Get IDs of material and all its children
        const idsToDelete = [materialId];
        const childIds = item.materials
          .filter(m => m.parentMaterialId === materialId)
          .map(m => m.id);
        idsToDelete.push(...childIds);

        const remaining = item.materials.filter(m => !idsToDelete.includes(m.id));
        return { ...item, materials: resequenceMaterials(remaining) };
      }
      return item;
    }));
  };

  // Drag-and-drop reordering for materials
  const dragRef = useRef({ sourceId: null, sourceItemId: null, isParent: false });
  const [dropTarget, setDropTarget] = useState(null); // { materialId, position: 'before'|'after' }

  const handleDragStart = (e, itemId, materialId, isParent) => {
    dragRef.current = { sourceId: materialId, sourceItemId: itemId, isParent };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ''); // Required for Firefox
  };

  const handleDragOver = (e, itemId, targetId, targetIsParent, targetParentId) => {
    e.preventDefault();
    const { sourceId, sourceItemId, isParent: sourceIsParent } = dragRef.current;
    if (!sourceId || sourceItemId !== itemId) return;
    // Parents can only drag among parents; children only within same parent
    if (sourceIsParent !== targetIsParent) return;
    if (!sourceIsParent) {
      // Children must share the same parent
      const item = items.find(i => i.id === itemId);
      const sourceMat = item?.materials.find(m => m.id === sourceId);
      if (sourceMat?.parentMaterialId !== targetParentId) return;
    }
    if (sourceId === targetId) { setDropTarget(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = e.clientY < midY ? 'before' : 'after';
    setDropTarget({ materialId: targetId, position });
  };

  const handleDrop = (e, itemId) => {
    e.preventDefault();
    const { sourceId, isParent: sourceIsParent } = dragRef.current;
    if (!sourceId || !dropTarget) { setDropTarget(null); return; }

    setItems(items.map(item => {
      if (item.id !== itemId) return item;
      let mats = [...item.materials];
      if (sourceIsParent) {
        mats = reorderParent(mats, sourceId, dropTarget.materialId, dropTarget.position);
      } else {
        mats = reorderChild(mats, sourceId, dropTarget.materialId, dropTarget.position);
      }
      return { ...item, materials: resequenceMaterials(mats) };
    }));
    setDropTarget(null);
    dragRef.current = { sourceId: null, sourceItemId: null, isParent: false };
  };

  const handleDragEnd = () => {
    setDropTarget(null);
    dragRef.current = { sourceId: null, sourceItemId: null, isParent: false };
  };

  const reorderParent = (materials, sourceId, targetId, position) => {
    // Collect parent groups (parent + its children) in current order
    const parents = materials.filter(m => !m.parentMaterialId);
    const groups = parents.map(p => ({
      parent: p,
      children: materials.filter(m => m.parentMaterialId === p.id)
    }));
    // Remove source group
    const srcIdx = groups.findIndex(g => g.parent.id === sourceId);
    const [srcGroup] = groups.splice(srcIdx, 1);
    // Find target index and insert
    const tgtIdx = groups.findIndex(g => g.parent.id === targetId);
    const insertIdx = position === 'before' ? tgtIdx : tgtIdx + 1;
    groups.splice(insertIdx, 0, srcGroup);
    // Flatten back
    return groups.flatMap(g => [g.parent, ...g.children]);
  };

  const reorderChild = (materials, sourceId, targetId, position) => {
    const sourceMat = materials.find(m => m.id === sourceId);
    const parentId = sourceMat.parentMaterialId;
    // Get children of the same parent in current order
    const children = materials.filter(m => m.parentMaterialId === parentId);
    const srcIdx = children.findIndex(c => c.id === sourceId);
    const [srcChild] = children.splice(srcIdx, 1);
    const tgtIdx = children.findIndex(c => c.id === targetId);
    const insertIdx = position === 'before' ? tgtIdx : tgtIdx + 1;
    children.splice(insertIdx, 0, srcChild);
    // Rebuild materials: keep everything except this parent's children, then re-insert children after parent
    const withoutChildren = materials.filter(m => m.parentMaterialId !== parentId);
    const parentIdx = withoutChildren.findIndex(m => m.id === parentId);
    const result = [...withoutChildren];
    result.splice(parentIdx + 1, 0, ...children);
    return result;
  };

  // Material-level Fabrication functions
  const addMaterialFab = async (itemId, materialId) => {
    // Snapshot current state before async work
    const currentItem = items.find(i => i.id === itemId);
    const material = currentItem?.materials.find(m => m.id === materialId);
    const isChild = !!material?.parentMaterialId;
    const defaultOp = isChild ? 'Welding- Fillet' : 'Cut- Straight';

    // Fetch pricing for the default op (covers drilling/prep/welding global rates too)
    const pricing = material?.size ? await getPricingForSize(material.size) : null;
    const rate = pricing?.[OP_PRICING_FIELD[defaultOp]] ?? 0;

    setItems(prevItems => prevItems.map(item => {
      if (item.id !== itemId) return item;
      const mat = item.materials.find(m => m.id === materialId);
      if (!mat) return item;
      const parent = mat.parentMaterialId
        ? item.materials.find(m => m.id === mat.parentMaterialId)
        : null;

      const newFab = isChild ? {
        id: Date.now(),
        applyTo: parent ? parent.id : 'self',
        operation: defaultOp,
        quantity: 1,
        length: null,
        unit: OP_DEFAULT_UNIT[defaultOp] ?? 'IN',
        unitPrice: rate,
        totalCost: rate, // qty=1 × rate
      } : {
        id: Date.now(),
        applyTo: null,
        operation: defaultOp,
        quantity: 1,
        length: null,
        unit: 'EA',
        unitPrice: rate,
        totalCost: rate, // qty=1 × rate
        connWeight: null,
      };

      return {
        ...item,
        materials: item.materials.map(m =>
          m.id === materialId ? { ...m, fabrication: [...(m.fabrication || []), newFab] } : m
        ),
      };
    }));
  };

  const updateMaterialFab = async (itemId, materialId, fabId, field, value) => {
    // Pre-fetch pricing before entering setItems when the operation is changing
    let pricing = null;
    if (field === 'operation') {
      const currentItem = items.find(i => i.id === itemId);
      const currentMat = currentItem?.materials.find(m => m.id === materialId);
      if (currentMat?.size) pricing = await getPricingForSize(currentMat.size);
    }

    setItems(prevItems => prevItems.map(item => {
      if (item.id !== itemId) return item;

      const updatedMaterials = item.materials.map(mat => {
        if (mat.id !== materialId) return mat;

        const updatedFab = (mat.fabrication || []).map(fab => {
          if (fab.id !== fabId) return fab;

          const updated = { ...fab, [field]: value };

          // Handle operation change — apply DB pricing for the new operation
          if (field === 'operation') {
            const newOp = value;
            const isConnOp = CONNECTION_WEIGHT_OPS.has(newOp);
            const pricingField = OP_PRICING_FIELD[newOp];
            const rate = pricingField
              ? (pricing?.[pricingField] ?? 0)
              : (customOpRateMap[newOp]?.rate ?? 0);
            const weightField = OP_WEIGHT_FIELD[newOp];
            const connWeight = (pricing && weightField)
              ? (pricing[weightField] ?? getConnectionWeight(mat.size, mat.category))
              : (isConnOp ? getConnectionWeight(mat.size, mat.category) : null);

            updated.unitPrice = rate;
            updated.length = null;

            if (isConnOp) {
              updated.connWeight = connWeight;
              updated.quantity = 1;
              updated.unit = 'EA';
              updated.galvanized = false;
              updated.galvWeight = null;
            } else {
              updated.connWeight = null;
              updated.galvanized = false;
              updated.galvWeight = null;
              updated.unit = OP_DEFAULT_UNIT[newOp] ?? customOpRateMap[newOp]?.unit ?? 'EA';
            }
          }
          
          // Calculate galv weight for connections when galvanized or qty/connWeight changes
          if (updated.connWeight && CONNECTION_WEIGHT_OPS.has(updated.operation)) {
            if (updated.galvanized) {
              updated.galvWeight = (updated.quantity || 0) * updated.connWeight;
            } else {
              updated.galvWeight = null;
            }
          }
          
          // Calculate total
          const qty = updated.quantity || 0;
          const len = updated.length || 0;
          const rate = updated.unitPrice || 0;
          
          // For connection operations: check unit type
          if (updated.connWeight && CONNECTION_WEIGHT_OPS.has(updated.operation)) {
            // If unit is LB, multiply by connWeight; if EA, just qty × rate
            if (updated.unit === 'LB') {
              updated.totalCost = qty * updated.connWeight * rate;
            } else {
              updated.totalCost = qty * rate;
            }
          } else if ((updated.unit === 'IN' || updated.unit === 'LF') && len > 0) {
            // For length-based: Total = Qty × Length × Rate
            updated.totalCost = qty * len * rate;
          } else {
            // For standard: Total = Qty × Rate
            updated.totalCost = qty * rate;
          }
          
          return updated;
        });
        
        // Handle galvanizing for connections - add/remove galv line item
        let finalFab = [...updatedFab];
        const changedFab = updatedFab.find(f => f.id === fabId);
        
        if (changedFab && CONNECTION_WEIGHT_OPS.has(changedFab.operation)) {
          const galvLineId = `galv-${fabId}`; // Linked galv line ID
          const galvLineIndex = finalFab.findIndex(f => f.id === galvLineId);
          
          if (field === 'galvanized') {
            if (value === true && changedFab.galvWeight > 0) {
              // Add galv line for this connection
              if (galvLineIndex === -1) {
                finalFab.push({
                  id: galvLineId,
                  operation: 'Galvanizing',
                  description: `Galv - ${changedFab.operation}`,
                  quantity: changedFab.galvWeight,
                  unit: 'LB',
                  unitPrice: 0,
                  totalCost: 0,
                  isConnGalv: true,
                  parentFabId: fabId
                });
              }
            } else {
              // Remove galv line for this connection
              if (galvLineIndex !== -1) {
                finalFab.splice(galvLineIndex, 1);
              }
            }
          } else if (['quantity', 'connWeight'].includes(field) && changedFab.galvanized) {
            // Update existing galv line weight
            if (galvLineIndex !== -1) {
              finalFab[galvLineIndex] = {
                ...finalFab[galvLineIndex],
                quantity: changedFab.galvWeight,
                totalCost: (changedFab.galvWeight || 0) * (finalFab[galvLineIndex].unitPrice || 0)
              };
            }
          }
        }
        
        return { ...mat, fabrication: finalFab };
      });
      
      return { ...item, materials: updatedMaterials };
    }));
  };

  const deleteMaterialFab = (itemId, materialId, fabId) => {
    setItems(items.map(item => {
      if (item.id !== itemId) return item;
      
      const updatedMaterials = item.materials.map(mat => {
        if (mat.id !== materialId) return mat;
        // Filter out the target fab AND any linked galv lines (parentFabId or galv-{fabId} pattern)
        return { ...mat, fabrication: (mat.fabrication || []).filter(f => 
          f.id !== fabId && f.parentFabId !== fabId && f.id !== `galv-${fabId}`
        ) };
      });
      
      return { ...item, materials: updatedMaterials };
    }));
  };

  // Item-level Fabrication functions (for general ops like Handling, Prime Paint)
  const addFabrication = (itemId) => {
    const newFab = {
      id: Date.now(),
      operation: 'Handling',
      description: '',
      quantity: 1,
      unit: 'EA',
      unitPrice: 0,
      totalCost: 0
    };
    setItems(items.map(item =>
      item.id === itemId ? { ...item, fabrication: [...item.fabrication, newFab] } : item
    ));
  };

  const updateFabrication = (itemId, fabId, field, value) => {
    setItems(items.map(item => {
      if (item.id === itemId) {
        const updatedFab = item.fabrication.map(fab => {
          if (fab.id === fabId) {
            const updated = { ...fab, [field]: value };
            updated.totalCost = (updated.quantity || 0) * (updated.unitPrice || 0);
            return updated;
          }
          return fab;
        });
        return { ...item, fabrication: updatedFab };
      }
      return item;
    }));
  };

  const deleteFabrication = (itemId, fabId) => {
    setItems(items.map(item =>
      item.id === itemId ? { ...item, fabrication: item.fabrication.filter(f => f.id !== fabId) } : item
    ));
  };

  // ── SNAPSHOT HELPERS ────────────────────────────────────────────────────────
  const compressImage = (file) => new Promise((resolve) => {
    const MAX_W = 1400;
    const QUALITY = 0.75;
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(1, MAX_W / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', QUALITY));
    };
    img.src = URL.createObjectURL(file);
  });

  const addSnapshot = async (itemId, file) => {
    const imageData = await compressImage(file);
    const snap = { id: Date.now() + Math.random(), imageData, caption: '', sortOrder: 0 };
    setItems(items.map(item =>
      item.id === itemId
        ? { ...item, snapshots: [...(item.snapshots || []), snap] }
        : item
    ));
  };

  const removeSnapshot = (itemId, snapId) => {
    setItems(items.map(item =>
      item.id === itemId
        ? { ...item, snapshots: (item.snapshots || []).filter(s => s.id !== snapId) }
        : item
    ));
  };

  const updateSnapshotCaption = (itemId, snapId, caption) => {
    setItems(items.map(item =>
      item.id === itemId
        ? { ...item, snapshots: (item.snapshots || []).map(s => s.id === snapId ? { ...s, caption } : s) }
        : item
    ));
  };

  const handleSnapshotPaste = async (itemId, e) => {
    const items2 = e.clipboardData?.items;
    if (!items2) return;
    for (const clipItem of items2) {
      if (clipItem.type.startsWith('image/')) {
        e.preventDefault();
        await addSnapshot(itemId, clipItem.getAsFile());
        break;
      }
    }
  };

  // Recap cost functions
  const updateRecapCost = (itemId, costType, field, value) => {
    setItems(items.map(item => {
      if (item.id === itemId) {
        const updatedCosts = { ...item.recapCosts };
        if (costType === 'projectManagement') {
          // PM uses hours * rate
          updatedCosts.projectManagement = { ...updatedCosts.projectManagement, [field]: parseFloat(value) || 0 };
          updatedCosts.projectManagement.total = updatedCosts.projectManagement.hours * updatedCosts.projectManagement.rate;
        } else {
          // Installation, Drafting, Engineering, Shipping, Custom use cost + markup %
          updatedCosts[costType] = { ...updatedCosts[costType], [field]: parseFloat(value) || 0 };
          const baseCost = updatedCosts[costType].cost || 0;
          const markupPct = updatedCosts[costType].markup || 0;
          updatedCosts[costType].total = baseCost + (baseCost * markupPct / 100);
        }
        return { ...item, recapCosts: updatedCosts };
      }
      return item;
    }));
  };

  // Custom Recap Column functions
  const addCustomRecapColumn = (name) => {
    if (!name || name.trim() === '') return;
    const colKey = `custom_${Date.now()}`;
    const colName = name.trim();
    
    // Add to custom columns list
    setCustomRecapColumns([...customRecapColumns, { key: colKey, name: colName }]);
    
    // Add to all items' recapCosts
    setItems(items.map(item => ({
      ...item,
      recapCosts: {
        ...item.recapCosts,
        [colKey]: { cost: 0, markup: 0, total: 0 }
      }
    })));
  };

  const removeCustomRecapColumn = (colKey) => {
    // Remove from custom columns list
    setCustomRecapColumns(customRecapColumns.filter(c => c.key !== colKey));
    
    // Remove from all items' recapCosts
    setItems(items.map(item => {
      const updatedCosts = { ...item.recapCosts };
      delete updatedCosts[colKey];
      return { ...item, recapCosts: updatedCosts };
    }));
  };

  const renameCustomRecapColumn = (colKey, newName) => {
    setCustomRecapColumns(customRecapColumns.map(c => 
      c.key === colKey ? { ...c, name: newName } : c
    ));
  };

  // Calculate totals
  const calculateTotals = () => {
    let totalMaterialCost = 0;
    let totalFabricationCost = 0;
    let totalFabWeight = 0;
    let totalStockWeight = 0;
    let totalRecapCosts = 0;
    let totalMaterialMarkup = 0;
    let totalFabMarkup = 0;
    let totalConnectionWeight = 0;

    items.forEach(item => {
      let itemMatCost = 0;
      let itemFabCost = 0;
      
      item.materials.forEach(mat => {
        itemMatCost += mat.totalCost || 0;
        totalFabWeight += mat.fabWeight || 0;
        totalStockWeight += mat.stockWeight || 0;
        // Add material-level fabrication costs and connection weights
        if (mat.fabrication) {
          mat.fabrication.forEach(fab => {
            itemFabCost += fab.totalCost || 0;
            // Add connection weights
            if (CONNECTION_WEIGHT_OPS.has(fab.operation) && fab.connWeight) {
              totalConnectionWeight += (fab.quantity || 0) * fab.connWeight;
            }
          });
        }
      });
      // Add item-level fabrication costs
      item.fabrication.forEach(fab => {
        itemFabCost += fab.totalCost || 0;
      });
      
      // Calculate markups for this item (separate material and fab)
      const matMarkupAmount = itemMatCost * ((item.materialMarkup || 0) / 100);
      const fabMarkupAmount = itemFabCost * ((item.fabMarkup || 0) / 100);
      totalMaterialMarkup += matMarkupAmount;
      totalFabMarkup += fabMarkupAmount;
      
      // Add to totals (before markup)
      totalMaterialCost += itemMatCost;
      totalFabricationCost += itemFabCost;
      
      // Add recap costs
      Object.values(item.recapCosts).forEach(cost => {
        totalRecapCosts += cost.total || 0;
      });
    });

    const totalMarkup = totalMaterialMarkup + totalFabMarkup;
    const totalTax = items.reduce((s, i) => s + calculateItemTax(i), 0);
    const subtotal = totalMaterialCost + totalFabricationCost + totalMarkup + totalRecapCosts + totalTax;
    const totalAdjustments = adjustments.reduce((sum, adj) => sum + (parseFloat(adj.amount) || 0), 0);
    const grandTotal = subtotal + totalAdjustments;

    return { totalMaterialCost, totalFabricationCost, totalMaterialMarkup, totalFabMarkup, totalMarkup, totalRecapCosts, totalTax, totalFabWeight, totalStockWeight, totalConnectionWeight, subtotal, totalAdjustments, grandTotal };
  };

  const totals = useMemo(() => calculateTotals(), [items, adjustments, taxCategory]);

  // Get stock list
  const getStockList = () => {
    const stockSummary = {};
    items.forEach(item => {
      item.materials.forEach(mat => {
        if (mat.size && mat.stocksRequired > 0) {
          const key = `${mat.size}-${mat.stockLength}`;
          if (!stockSummary[key]) {
            stockSummary[key] = { size: mat.size, stockLength: mat.stockLength, weightPerFoot: mat.weightPerFoot, totalStocks: 0, totalWeight: 0 };
          }
          stockSummary[key].totalStocks += mat.stocksRequired;
          stockSummary[key].totalWeight += mat.stocksRequired * mat.stockLength * mat.weightPerFoot;
        }
      });
    });
    return Object.values(stockSummary).sort((a, b) => a.size.localeCompare(b.size));
  };

  // Memoized stock list to avoid recalculating on every render
  const stockList = useMemo(() => getStockList(), [items]);

  return (
    <div className="max-w-7xl mx-auto p-4 bg-gray-100 dark:bg-gray-700 min-h-screen">
      <div className="bg-white dark:bg-gray-900 rounded shadow">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-300 dark:border-gray-600">
          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                if (isDirty) await saveRef.current?.();
                window.location.href = '/dashboard';
              }}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-800"
              title="Back to Projects"
              data-testid="button-back"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Steel Estimator</h1>
            </div>
            <span className={`ml-2 px-2.5 py-1 rounded border text-xs font-semibold ${STATUS_COLORS[projectStatus] || 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600'}`} data-testid="text-project-status">
              {STATUS_LABELS[projectStatus] || projectStatus}
            </span>
            {isReadOnly && <span className="text-xs text-amber-600 font-medium">(Read Only)</span>}
          </div>
          <div className="flex gap-2 items-center flex-wrap justify-end">
            {isDirty && saveStatus !== 'saving' && saveStatus !== 'saved' && (
              <span className="text-amber-500 text-sm flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                Unsaved
              </span>
            )}
            {saveStatus === 'saved' && <span className="text-green-600 text-sm flex items-center gap-1"><Check size={14} /> Saved</span>}
            {saveStatus === 'error' && <span className="text-red-600 text-sm">Save failed</span>}
            {canEdit && (
              <button
                onClick={handleSave}
                disabled={saveStatus === 'saving'}
                className="flex items-center gap-1 bg-gray-700 dark:bg-gray-600 text-white px-3 py-2 rounded text-sm hover:bg-gray-800 disabled:opacity-50"
                data-testid="button-save"
              >
                <Save size={16} /> {saveStatus === 'saving' ? 'Saving...' : 'Save'}
              </button>
            )}
            <div className="relative" ref={exportMenuRef}>
              <button onClick={() => setShowExportMenu(p => !p)} disabled={pdfExporting}
                className="flex items-center gap-1 bg-gray-700 dark:bg-gray-600 text-white px-3 py-2 rounded text-sm hover:bg-gray-800 disabled:opacity-50">
                {pdfExporting
                  ? <><span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Generating…</>
                  : <><Download size={16} /> Export <ChevronDown size={14} /></>}
              </button>
              {showExportMenu && !pdfExporting && (
                <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg z-50 min-w-48">
                  <button onClick={handleExportErectorScope}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                    <FileText size={14} /> Erector Scope (No Pricing)
                  </button>
                  <div className="border-t border-gray-100 dark:border-gray-700" />
                  <button onClick={handleExportJobFolder}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                    <Download size={14} /> Job Folder (Full)
                  </button>
                </div>
              )}
            </div>
            {/* Status transition buttons */}
            {projectStatus === 'DRAFT' && (userRole === 'ADMIN' || userRole === 'ESTIMATOR') && (
              <button onClick={() => handleStatusChange('IN_REVIEW')} disabled={statusChanging}
                className="px-3 py-2 bg-amber-500 dark:bg-amber-600 text-white rounded text-sm hover:bg-amber-600 dark:hover:bg-amber-500 disabled:opacity-50" data-testid="button-submit-review">
                Submit for Review
              </button>
            )}
            {projectStatus === 'IN_REVIEW' && userRole === 'ADMIN' && (
              <button onClick={() => handleStatusChange('PUBLISHED')} disabled={statusChanging}
                className="px-3 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50" data-testid="button-publish">
                Publish
              </button>
            )}
            {projectStatus === 'IN_REVIEW' && (userRole === 'ESTIMATOR' || userRole === 'ADMIN') && (
              <button onClick={() => handleStatusChange('DRAFT')} disabled={statusChanging}
                className="px-3 py-2 bg-gray-500 text-white rounded text-sm hover:bg-gray-600 disabled:opacity-50" data-testid="button-recall">
                Recall Submission
              </button>
            )}
            {projectStatus === 'PUBLISHED' && userRole === 'ADMIN' && (
              <button onClick={() => handleStatusChange('REOPENED')} disabled={statusChanging}
                className="px-3 py-2 bg-purple-600 text-white rounded text-sm hover:bg-purple-700 disabled:opacity-50" data-testid="button-reopen">
                Reopen for Editing
              </button>
            )}
            {projectStatus === 'REOPENED' && userRole === 'ADMIN' && (
              <button onClick={() => handleStatusChange('PUBLISHED')} disabled={statusChanging}
                className="px-3 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50" data-testid="button-republish">
                Re-Publish
              </button>
            )}
            {userRole === 'ADMIN' && projectStatus !== 'DRAFT' && projectStatus !== 'IN_REVIEW' && (
              <button onClick={() => handleStatusChange('DRAFT')} disabled={statusChanging}
                className="px-3 py-2 bg-gray-500 text-white rounded text-sm hover:bg-gray-600 disabled:opacity-50" data-testid="button-reset-draft">
                Reset to Draft
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-300 dark:border-gray-600 overflow-x-auto">
          {['project', 'estimate', 'stocklist', 'recap', 'summary', 'quote'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 font-medium whitespace-nowrap ${activeTab === tab ? 'bg-gray-700 dark:bg-gray-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
            >
              {tab === 'project' ? 'Project Info' : tab === 'estimate' ? 'Estimate' : tab === 'recap' ? 'Recap' : tab === 'stocklist' ? 'Stock List' : tab === 'summary' ? 'Summary' : 'Quote'}
            </button>
          ))}
        </div>

        <div className="p-4">
          {/* PROJECT TAB */}
          {activeTab === 'project' && (
            <div className="space-y-6">
              {/* Customer Info */}
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded border">
                <h2 className="text-lg font-semibold mb-3">Customer Information</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Company Name</label>
                    <CustomerSearchInput
                      value={customerName}
                      customerId={customerId}
                      onChange={(name, id) => { setCustomerName(name); setCustomerId(id); }}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Billing Address</label>
                    <input type="text" value={billingAddress} onChange={e => setBillingAddress(e.target.value)}
                      className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Contact Name</label>
                    <input type="text" value={customerContact} onChange={e => setCustomerContact(e.target.value)}
                      className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                    <input type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
                      className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                    <input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)}
                      className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
                  </div>
                </div>
              </div>

              {/* Project Details */}
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded border">
                <h2 className="text-lg font-semibold mb-3">Project Details</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Project Name</label>
                    <input type="text" value={projectName} onChange={e => setProjectName(e.target.value)}
                      className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Project Address</label>
                    <input type="text" value={projectAddress} onChange={e => setProjectAddress(e.target.value)}
                      className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Drawing Date</label>
                    <input type="date" value={drawingDate} onChange={e => setDrawingDate(e.target.value)}
                      className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Drawing Revision</label>
                    <input type="text" value={drawingRevision} onChange={e => setDrawingRevision(e.target.value)}
                      className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Architect</label>
                    <input type="text" value={architect} onChange={e => setArchitect(e.target.value)}
                      className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Bid Date</label>
                    <input type="date" value={estimateDate} onChange={e => setEstimateDate(e.target.value)}
                      className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Time Due</label>
                    <select value={bidTime} onChange={e => setBidTime(e.target.value)}
                      className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100">
                      <option value="">— No Time —</option>
                      {['06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'].map(t => {
                        const [h] = t.split(':').map(Number);
                        const label = h === 12 ? '12:00 PM' : h > 12 ? `${h-12}:00 PM` : `${h}:00 AM`;
                        return <option key={t} value={t}>{label}</option>;
                      })}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Estimated By</label>
                    <input type="text" value={estimatedBy} onChange={e => setEstimatedBy(e.target.value)}
                      className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
                  </div>
                </div>
              </div>

              {/* Bid & Dashboard */}
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded border">
                <h2 className="text-lg font-semibold mb-3">Bid &amp; Dashboard</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Estimator</label>
                    <select
                      value={estimatorId || ''}
                      onChange={e => setEstimatorId(e.target.value ? parseInt(e.target.value) : null)}
                      className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                    >
                      <option value="">— Unassigned —</option>
                      {usersList.map(u => (
                        <option key={u.id} value={u.id}>
                          {[u.firstName, u.lastName].filter(Boolean).join(' ') || `User ${u.id}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">New / C.O.</label>
                    <select
                      value={newOrCo}
                      onChange={e => setNewOrCo(e.target.value)}
                      className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                    >
                      <option value="">— None —</option>
                      <option value="NEW_PROJECT">New Project</option>
                      <option value="CHANGE_ORDER">Change Order</option>
                    </select>
                  </div>
                  <div className="col-span-2 md:col-span-4">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                    <textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      rows={3}
                      className="w-full p-2 border rounded text-sm resize-y dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                      placeholder="Internal notes about this bid..."
                    />
                  </div>
                </div>
              </div>

              {/* Project Type */}
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded border">
                <h2 className="text-lg font-semibold mb-3">Project Type</h2>
                <div className="flex flex-wrap gap-6 mb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={projectTypes.structural}
                      onChange={() => toggleProjectType('structural')}
                      className="w-4 h-4 rounded" />
                    <span className="text-sm font-medium">Structural</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={projectTypes.miscellaneous}
                      onChange={() => toggleProjectType('miscellaneous')}
                      className="w-4 h-4 rounded" />
                    <span className="text-sm font-medium">Miscellaneous</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={projectTypes.ornamental}
                      onChange={() => toggleProjectType('ornamental')}
                      className="w-4 h-4 rounded" />
                    <span className="text-sm font-medium">Ornamental</span>
                  </label>
                  {customProjectTypes.map(t => (
                    <label key={t} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked
                        onChange={() => removeCustomProjectType(t)}
                        className="w-4 h-4 rounded" />
                      <span className="text-sm font-medium">{t}</span>
                    </label>
                  ))}
                </div>
                <div className="border-t pt-3 mt-3">
                  <p className="text-sm font-medium mb-2">Custom Types:</p>
                  <div className="flex gap-2">
                    <input type="text" value={newCustomProjectType} onChange={e => setNewCustomProjectType(e.target.value)}
                      placeholder="Add custom type" className="flex-1 p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                      onKeyDown={e => e.key === 'Enter' && addCustomProjectType()} />
                    <button onClick={addCustomProjectType} className="bg-blue-600 text-white px-3 py-1 rounded text-sm">Add</button>
                  </div>
                </div>
              </div>

              {/* Delivery Options */}
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded border">
                <h2 className="text-lg font-semibold mb-3">Delivery Options</h2>
                <div className="flex flex-wrap gap-6 mb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="deliveryOption" checked={deliveryOptions.installed}
                      onChange={() => toggleDeliveryOption('installed')}
                      className="w-4 h-4" />
                    <span className="text-sm font-medium">Installed</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="deliveryOption" checked={deliveryOptions.fobJobsite}
                      onChange={() => toggleDeliveryOption('fobJobsite')}
                      className="w-4 h-4" />
                    <span className="text-sm font-medium">F.O.B. Jobsite</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="deliveryOption" checked={deliveryOptions.willCall}
                      onChange={() => toggleDeliveryOption('willCall')}
                      className="w-4 h-4" />
                    <span className="text-sm font-medium">Will Call</span>
                  </label>
                  {customDeliveryOptions.map(opt => (
                    <label key={opt} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="deliveryOption" checked={selectedCustomDelivery === opt}
                        onChange={() => selectCustomDelivery(opt)}
                        className="w-4 h-4" />
                      <span className="text-sm font-medium">{opt}</span>
                    </label>
                  ))}
                </div>
                <div className="border-t pt-3 mt-3">
                  <p className="text-sm font-medium mb-2">Custom Options:</p>
                  <div className="flex gap-2 mb-2">
                    <input type="text" value={newCustomDeliveryOption} onChange={e => setNewCustomDeliveryOption(e.target.value)}
                      placeholder="Add custom option" className="flex-1 p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                      onKeyDown={e => e.key === 'Enter' && addCustomDeliveryOption()} />
                    <button onClick={addCustomDeliveryOption} className="bg-purple-600 text-white px-3 py-1 rounded text-sm">Add</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {customDeliveryOptions.map(opt => (
                      <span key={opt} className="bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 px-2 py-1 rounded text-sm flex items-center gap-1">
                        {opt}
                        <button onClick={() => removeCustomDeliveryOption(opt)} className="text-purple-600 dark:text-purple-300 hover:text-purple-800"><X size={14} /></button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Tax Category */}
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded border">
                <h2 className="text-lg font-semibold mb-3">Tax Category</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(taxCategoryDescriptions).map(([key, info]) => {
                    const isSelected = taxCategory === key;
                    const colorMap = {
                      blue: isSelected ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400',
                      green: isSelected ? 'bg-green-600 text-white border-green-600' : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-green-400',
                      amber: isSelected ? 'bg-amber-600 text-white border-amber-600' : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-amber-400',
                      gray: isSelected ? 'bg-gray-600 text-white border-gray-600' : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-gray-400'
                    };
                    return (
                      <button
                        key={key}
                        onClick={() => setTaxCategory(taxCategory === key ? null : key)}
                        className={`p-3 rounded border-2 text-left transition-all ${colorMap[info.color]}`}
                      >
                        <div className="font-semibold text-sm">{info.label}</div>
                        <div className={`text-xs mt-1 ${isSelected ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}`}>{info.description}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between mt-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Local rate: {(TAX_RATE * 100).toFixed(2)}% — Select a category to auto-generate the tax column on the Recap tab.</p>
                  {taxCategory && (
                    <span className="text-xs font-medium px-2 py-1 rounded bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300">
                      Active: {taxCategoryDescriptions[taxCategory].label}
                    </span>
                  )}
                </div>
              </div>

              {/* Exclusions */}
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded border">
                <h2 className="text-lg font-semibold mb-3">Exclusions</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
                  {standardExclusions.map(exc => (
                    <label key={exc} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={selectedExclusions.includes(exc)}
                        onChange={() => toggleExclusion(exc)} className="rounded" />
                      {exc}
                    </label>
                  ))}
                </div>
                {/* Custom exclusions */}
                <div className="border-t pt-3">
                  <p className="text-sm font-medium mb-2">Custom Exclusions:</p>
                  <div className="flex gap-2 mb-2">
                    <input type="text" value={newCustomExclusion} onChange={e => setNewCustomExclusion(e.target.value)}
                      placeholder="Add custom exclusion" className="flex-1 p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                      onKeyDown={e => e.key === 'Enter' && addCustomExclusion()} />
                    <button onClick={addCustomExclusion} className="bg-blue-600 text-white px-3 py-1 rounded text-sm">Add</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {customExclusions.map(exc => (
                      <span key={exc} className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm flex items-center gap-1">
                        {exc}
                        <button onClick={() => removeCustomExclusion(exc)} className="text-blue-600 hover:text-blue-800"><X size={14} /></button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Qualifications */}
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded border">
                <h2 className="text-lg font-semibold mb-3">Qualifications</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
                  {standardQualifications.map(qual => (
                    <label key={qual} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={selectedQualifications.includes(qual)}
                        onChange={() => toggleQualification(qual)} className="rounded" />
                      {qual}
                    </label>
                  ))}
                </div>
                {/* Custom qualifications */}
                <div className="border-t pt-3">
                  <p className="text-sm font-medium mb-2">Custom Qualifications:</p>
                  <div className="flex gap-2 mb-2">
                    <input type="text" value={newCustomQualification} onChange={e => setNewCustomQualification(e.target.value)}
                      placeholder="Add custom qualification" className="flex-1 p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                      onKeyDown={e => e.key === 'Enter' && addCustomQualification()} />
                    <button onClick={addCustomQualification} className="bg-green-600 text-white px-3 py-1 rounded text-sm">Add</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {customQualifications.map(qual => (
                      <span key={qual} className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm flex items-center gap-1">
                        {qual}
                        <button onClick={() => removeCustomQualification(qual)} className="text-green-600 hover:text-green-800"><X size={14} /></button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ESTIMATE TAB */}
          {activeTab === 'estimate' && (
            <div className="space-y-4">
              {/* Import/Export Controls */}
              <div className="flex justify-between items-center bg-gray-100 dark:bg-gray-700 p-3 rounded border">
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    ref={takeoffFileInputRef}
                    onChange={handleTakeoffFileSelect}
                    accept=".csv"
                    className="hidden"
                  />
                  <button
                    onClick={() => takeoffFileInputRef.current?.click()}
                    disabled={takeoffImporting}
                    className="flex items-center gap-2 bg-blue-700 text-white px-3 py-2 rounded text-sm hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Upload size={16} />
                    {takeoffImporting ? 'Processing...' : 'Import Takeoff CSV'}
                  </button>
                </div>
                <button onClick={addItem} className="flex items-center gap-1 bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700">
                  <Plus size={16} /> Add Item
                </button>
              </div>

              {items.map(item => (
                <div key={item.id} className="border rounded">
                  <div className="bg-gray-200 dark:bg-gray-600 p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <button onClick={() => toggleItemExpansion(item.id)} className="text-gray-600 dark:text-gray-400">
                        {expandedItems[item.id] ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </button>
                      <input type="text" value={item.itemNumber} onChange={e => updateItem(item.id, 'itemNumber', e.target.value)}
                        className="w-16 p-1 border rounded text-sm font-mono dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
                      <input type="text" value={item.itemName} onChange={e => updateItem(item.id, 'itemName', e.target.value)}
                        className="flex-1 p-1 border rounded text-sm font-semibold dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
                      <input type="text" value={item.drawingRef} onChange={e => updateItem(item.id, 'drawingRef', e.target.value)}
                        className="w-24 p-1 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" placeholder="Dwg Ref" />
                    </div>
                    <button onClick={() => deleteItem(item.id)} className="text-red-600 hover:text-red-800 ml-2"><Trash2 size={16} /></button>
                  </div>

                  {expandedItems[item.id] && (
                    <div className="p-3 space-y-4">
                      {/* Materials */}
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <h3 className="font-semibold text-gray-800 dark:text-gray-200">Materials</h3>
                          <button onClick={() => addMaterial(item.id)} className="flex items-center gap-1 bg-blue-600 text-white px-2 py-1 rounded text-xs"><Plus size={14} /> Add Material</button>
                        </div>
                        {item.materials.length > 0 && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs border-collapse">
                              <thead>
                                <tr className="bg-gray-100 dark:bg-gray-700">
                                  <th className="border p-1 text-center w-12">Seq</th>
                                  <th className="border p-1 text-center">Description</th>
                                  <th className="border p-1 text-center w-28">Category</th>
                                  <th className="border p-1 text-center w-32">Size</th>
                                  <th className="border p-1 text-center w-12">Wt/ft</th>
                                  <th className="border p-1 text-center w-14">Qty</th>
                                  <th className="border p-1 text-center w-14">Length<div className="text-[9px] font-normal text-gray-500 dark:text-gray-400">(Lin/Ft)</div></th>
                                  <th className="border p-1 text-center w-16">Fab Wt</th>
                                  <th className="border p-1 text-center w-10">Galv</th>
                                  <th className="border p-1 text-center w-16" title="* indicates optimal length">Stock*</th>
                                  <th className="border p-1 text-center w-10">Stks</th>
                                  <th className="border p-1 text-center w-16">Stock Wt</th>
                                  <th className="border p-1 text-center w-14">Units</th>
                                  <th className="border p-1 text-center w-16">Rate</th>
                                  <th className="border p-1 text-center w-14">Total</th>
                                  <th className="border p-1 w-16"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {/* Render parent materials with their children */}
                                {getParentMaterials(item.materials).map(mat => (
                                  <React.Fragment key={mat.id}>
                                    {/* Parent row */}
                                    <tr
                                      className="bg-white dark:bg-gray-900"
                                      draggable
                                      onDragStart={e => handleDragStart(e, item.id, mat.id, true)}
                                      onDragOver={e => handleDragOver(e, item.id, mat.id, true, null)}
                                      onDragLeave={() => setDropTarget(dt => dt?.materialId === mat.id ? null : dt)}
                                      onDrop={e => handleDrop(e, item.id)}
                                      onDragEnd={handleDragEnd}
                                      style={dropTarget?.materialId === mat.id ? {
                                        boxShadow: dropTarget.position === 'before'
                                          ? 'inset 0 3px 0 0 #3b82f6'
                                          : 'inset 0 -3px 0 0 #3b82f6'
                                      } : undefined}
                                    >
                                      <td className="border p-1 font-bold text-blue-700">
                                        <div className="flex items-center gap-0.5">
                                          <GripVertical size={12} className="text-gray-400 cursor-grab flex-shrink-0" />
                                          {mat.sequence || 'A'}
                                        </div>
                                      </td>
                                      <td className="border p-1"><input type="text" value={mat.description || ''} onChange={e => updateMaterial(item.id, mat.id, 'description', e.target.value)} className="w-full p-1 border rounded text-xs dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" placeholder="Description" /></td>
                                      <td className="border p-1">
                                        <select value={mat.category} onChange={e => updateMaterial(item.id, mat.id, 'category', e.target.value)} className="w-full p-1 border rounded text-xs dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100">
                                          {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                          <option value="Custom">Custom</option>
                                        </select>
                                      </td>
                                      <td className="border p-1">
                                        {mat.category === 'Custom' ? (
                                          <input type="text" value={mat.size || ''} onChange={e => updateMaterial(item.id, mat.id, 'size', e.target.value)} className="w-full p-1 border rounded text-xs dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
                                        ) : mat.category === 'Plate' ? (
                                          <div className="flex items-center gap-1">
                                            <select 
                                              value={mat.plateThickness || ''} 
                                              onChange={e => updateMaterial(item.id, mat.id, 'plateThickness', e.target.value)} 
                                              className="flex-1 p-1 border rounded text-xs dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                                            >
                                              <option value="">Thick</option>
                                              {plateThicknesses.map(t => <option key={t.label} value={t.value}>{t.label}</option>)}
                                            </select>
                                            <span className="text-gray-500 dark:text-gray-400">×</span>
                                            <input 
                                              type="number" 
                                              step="0.5" 
                                              value={mat.plateWidth || ''} 
                                              onChange={e => updateMaterial(item.id, mat.id, 'plateWidth', parseFloat(e.target.value) || 0)} 
                                              className="w-12 p-1 border rounded text-xs text-right dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" 
                                              placeholder="W"
                                            />
                                            <span className="text-gray-500 dark:text-gray-400 text-xs">"</span>
                                          </div>
                                        ) : (
                                          <select value={mat.size} onChange={e => updateMaterial(item.id, mat.id, 'size', e.target.value)} className="w-full p-1 border rounded text-xs dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100">
                                            {getShapesForCategory(mat.category).map(s => <option key={s} value={s}>{s}</option>)}
                                          </select>
                                        )}
                                      </td>
                                      <td className="border p-1">
                                        {mat.category === 'Custom' ? (
                                          <input type="number" step="0.01" value={mat.customWeight || ''} onChange={e => updateMaterial(item.id, mat.id, 'customWeight', parseFloat(e.target.value) || 0)} className="w-full p-1 border rounded text-xs text-right dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
                                        ) : mat.category === 'Plate' ? (
                                          <span className="block text-right">{mat.weightPerFoot?.toFixed(2) || '—'}</span>
                                        ) : (
                                          <span className="block text-right">{mat.weightPerFoot?.toFixed(2)}</span>
                                        )}
                                      </td>
                                      <td className="border p-1">
                                        <div className="flex items-center justify-center gap-0.5">
                                          <button 
                                            onClick={() => updateMaterial(item.id, mat.id, 'pieces', Math.max(1, (mat.pieces || 1) - 1))}
                                            className="px-1 py-0.5 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 rounded text-xs font-bold"
                                          >−</button>
                                          <input 
                                            type="number" 
                                            value={mat.pieces || ''} 
                                            onChange={e => updateMaterial(item.id, mat.id, 'pieces', parseInt(e.target.value) || 0)} 
                                            className="w-10 p-1 border rounded text-xs text-center dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" 
                                          />
                                          <button 
                                            onClick={() => updateMaterial(item.id, mat.id, 'pieces', (mat.pieces || 0) + 1)}
                                            className="px-1 py-0.5 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 rounded text-xs font-bold"
                                          >+</button>
                                        </div>
                                      </td>
                                      <td className="border p-1"><input type="number" step="0.01" value={mat.length || ''} onChange={e => updateMaterial(item.id, mat.id, 'length', parseFloat(e.target.value) || 0)} className="w-full p-1 border rounded text-xs text-right dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" placeholder="0.00" /></td>
                                      <td className="border p-1 text-right bg-blue-50 dark:bg-blue-950">{fmtWt(mat.fabWeight || 0)}</td>
                                      <td className="border p-1 text-center">
                                        <input type="checkbox" checked={mat.galvanized || false} 
                                          onChange={e => updateMaterial(item.id, mat.id, 'galvanized', e.target.checked)} 
                                          className="w-4 h-4 rounded" title="Add Galvanizing" />
                                      </td>
                                      <td className="border p-1">
                                        <select 
                                          value={mat.stockLength} 
                                          onChange={e => updateMaterial(item.id, mat.id, 'stockLength', parseInt(e.target.value))} 
                                          className={`w-full p-1 border rounded text-xs dark:border-gray-600 dark:text-gray-100 ${mat.isManualOverride ? 'bg-yellow-50 dark:bg-yellow-950 border-yellow-400' : 'dark:bg-gray-800'}`}
                                          title={mat.isManualOverride ? `Optimal: ${mat.optimalStockLength}'` : `Optimal stock length`}
                                        >
                                          {getStockLengthsForCategory(mat.category).map(sl => (
                                            <option key={sl} value={sl}>
                                              {sl}'{sl === mat.optimalStockLength ? '*' : ''}
                                            </option>
                                          ))}
                                        </select>
                                        {mat.piecesPerStock > 0 && (
                                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{mat.piecesPerStock}/stk</div>
                                        )}
                                      </td>
                                      <td className="border p-1 text-right bg-gray-50 dark:bg-gray-800">{mat.stocksRequired || 0}</td>
                                      <td className="border p-1 text-right bg-gray-50 dark:bg-gray-800">{fmtWt(mat.stockWeight || 0)}</td>
                                      <td className="border p-1">
                                        <select value={mat.priceBy} onChange={e => updateMaterial(item.id, mat.id, 'priceBy', e.target.value)} className="w-full p-1 border rounded text-xs dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100">
                                          <option value="LB">LB</option><option value="LF">LF</option><option value="EA">EA</option>
                                        </select>
                                      </td>
                                      <td className="border p-1"><input type="number" step="0.01" value={mat.unitPrice || ''} onChange={e => updateMaterial(item.id, mat.id, 'unitPrice', parseFloat(e.target.value) || 0)} className="w-16 p-1 border rounded text-xs text-right dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" /></td>
                                      <td className="border p-1 text-right font-semibold bg-green-50 dark:bg-green-950">{fmtPrice(mat.totalCost || 0)}</td>
                                      <td className="border p-1">
                                        <div className="flex gap-1">
                                          <button onClick={() => addChildMaterial(item.id, mat.id)} className="text-blue-600 hover:text-blue-800" title="Add Attachment"><Plus size={12} /></button>
                                          <button onClick={() => addMaterialFab(item.id, mat.id)} className="text-green-600 hover:text-green-800" title="Add Fabrication"><Plus size={12} className="bg-green-100 rounded" /></button>
                                          <button onClick={() => deleteMaterial(item.id, mat.id)} className="text-red-600 hover:text-red-800" title="Delete"><Trash2 size={12} /></button>
                                        </div>
                                      </td>
                                    </tr>
                                    {/* Parent material fab rows */}
                                    {(mat.fabrication || []).filter(f => !f.isAutoGalv && !f.isConnGalv).map(fab => {
                                      const hasLength = (fab.unit === 'IN' || fab.unit === 'LF') && fab.length;
                                      const extLen = hasLength ? (fab.quantity || 0) * (fab.length || 0) : null;
                                      const isConnection = CONNECTION_WEIGHT_OPS.has(fab.operation);
                                      
                                      return (
                                      <tr key={fab.id} className="bg-green-50 dark:bg-green-950">
                                        {/* Seq */}
                                        <td className="border p-1 text-green-600 text-center text-xs font-medium">[Fab]</td>
                                        {/* Description - Operation dropdown */}
                                        <td className="border p-1">
                                          {fab.operation === 'Custom' ? (
                                            <div className="flex gap-1 items-center">
                                              <input
                                                type="text"
                                                value={fab.customOperation || ''}
                                                onChange={e => updateMaterialFab(item.id, mat.id, fab.id, 'customOperation', e.target.value)}
                                                placeholder="Custom operation..."
                                                className="flex-1 p-1 border border-orange-300 rounded text-xs bg-orange-50"
                                                autoFocus
                                              />
                                              <button onClick={() => updateMaterialFab(item.id, mat.id, fab.id, 'operation', 'Cut- Straight')} className="text-gray-400 hover:text-gray-600 text-xs px-1" title="Back to list">↩</button>
                                            </div>
                                          ) : (
                                          <select
                                            value={fab.operation}
                                            onChange={e => updateMaterialFab(item.id, mat.id, fab.id, 'operation', e.target.value)}
                                            className="w-full p-1 border rounded text-xs bg-green-50 dark:bg-green-950 dark:border-gray-600 dark:text-gray-100"
                                          >
                                            <optgroup label="Cutting">
                                              {fabricationOperations.cutting.map(op => <option key={op} value={op}>{op}</option>)}
                                            </optgroup>
                                            <optgroup label="Drilling">
                                              {fabricationOperations.drilling.map(op => <option key={op} value={op}>{op}</option>)}
                                            </optgroup>
                                            <optgroup label="Prep">
                                              {fabricationOperations.prep.map(op => <option key={op} value={op}>{op}</option>)}
                                            </optgroup>
                                            <optgroup label="Welding">
                                              {fabricationOperations.welding.map(op => <option key={op} value={op}>{op}</option>)}
                                            </optgroup>
                                            <optgroup label="Coatings">
                                              {fabricationOperations.coatings.map(op => <option key={op} value={op}>{op}</option>)}
                                            </optgroup>
                                            <optgroup label="Finishes">
                                              {fabricationOperations.finishes.map(op => <option key={op} value={op}>{op}</option>)}
                                            </optgroup>
                                            <optgroup label="Handling">
                                              {fabricationOperations.handling.map(op => <option key={op} value={op}>{op}</option>)}
                                            </optgroup>
                                            <optgroup label="Connections">
                                              {fabricationOperations.connections.map(op => <option key={op} value={op}>{op}</option>)}
                                            </optgroup>
                                            {Object.entries(
                                              customOps.reduce((acc, op) => {
                                                (acc[op.category] = acc[op.category] || []).push(op);
                                                return acc;
                                              }, {})
                                            ).map(([cat, ops]) => (
                                              <optgroup key={`custom-${cat}`} label={cat}>
                                                {ops.map(op => <option key={op.name} value={op.name}>{op.name}</option>)}
                                              </optgroup>
                                            ))}
                                            <optgroup label="Other">
                                              <option value="Custom">— Custom —</option>
                                            </optgroup>
                                          </select>
                                          )}
                                        </td>
                                        {/* Category */}
                                        <td className="border p-1 text-center text-gray-400">—</td>
                                        {/* Size */}
                                        <td className="border p-1 text-center text-gray-400">—</td>
                                        {/* Wt/ft - show unit connWeight for connections (for verification) */}
                                        <td className="border p-1 text-right text-xs">
                                          {isConnection && fab.connWeight ? (
                                            <span className="text-blue-600">{fab.connWeight}</span>
                                          ) : (
                                            <span className="text-gray-400">—</span>
                                          )}
                                        </td>
                                        {/* Qty */}
                                        <td className="border p-1">
                                          <div className="flex items-center justify-center gap-0.5">
                                            <button 
                                              onClick={() => updateMaterialFab(item.id, mat.id, fab.id, 'quantity', Math.max(0, (fab.quantity || 0) - 1))}
                                              className="px-1 py-0.5 bg-green-200 hover:bg-green-300 rounded text-xs font-bold"
                                            >−</button>
                                            <input 
                                              type="number" 
                                              step="1" 
                                              value={fab.quantity || ''} 
                                              onChange={e => updateMaterialFab(item.id, mat.id, fab.id, 'quantity', parseFloat(e.target.value) || 0)} 
                                              className="w-10 p-1 border rounded text-xs text-center bg-green-50 dark:bg-green-950 dark:border-gray-600 dark:text-gray-100" 
                                              placeholder="qty"
                                            />
                                            <button 
                                              onClick={() => updateMaterialFab(item.id, mat.id, fab.id, 'quantity', (fab.quantity || 0) + 1)}
                                              className="px-1 py-0.5 bg-green-200 hover:bg-green-300 rounded text-xs font-bold"
                                            >+</button>
                                          </div>
                                        </td>
                                        {/* Length (per operation) - disabled for connections */}
                                        <td className="border p-1">
                                          {isConnection ? (
                                            <span className="block text-center text-gray-400">—</span>
                                          ) : (fab.unit === 'IN' || fab.unit === 'LF') ? (
                                            <input 
                                              type="number" 
                                              step="0.1" 
                                              value={fab.length || ''} 
                                              onChange={e => updateMaterialFab(item.id, mat.id, fab.id, 'length', parseFloat(e.target.value) || 0)} 
                                              className="w-full p-1 border rounded text-xs text-right bg-green-50 dark:bg-green-950 dark:border-gray-600 dark:text-gray-100" 
                                              placeholder="len"
                                            />
                                          ) : (
                                            <span className="block text-center text-gray-400">—</span>
                                          )}
                                        </td>
                                        {/* Fab Wt - shows qty × connWeight for connections, extLen for length-based */}
                                        <td className="border p-1 text-right text-xs">
                                          {isConnection && fab.connWeight ? (
                                            <span className="text-blue-600 font-medium">{(fab.quantity || 0) * fab.connWeight}</span>
                                          ) : hasLength ? (
                                            extLen.toFixed(1)
                                          ) : (
                                            <span className="text-gray-400">—</span>
                                          )}
                                        </td>
                                        {/* Galv - enabled for connections */}
                                        <td className="border p-1 text-center">
                                          {isConnection ? (
                                            <input 
                                              type="checkbox" 
                                              checked={fab.galvanized || false} 
                                              onChange={e => updateMaterialFab(item.id, mat.id, fab.id, 'galvanized', e.target.checked)} 
                                              className="w-4 h-4 rounded" 
                                              title="Add Galvanizing for connection material"
                                            />
                                          ) : (
                                            <span className="text-gray-400">—</span>
                                          )}
                                        </td>
                                        {/* Stock */}
                                        <td className="border p-1 text-center text-gray-400">—</td>
                                        {/* Stks */}
                                        <td className="border p-1 text-center text-gray-400">—</td>
                                        {/* Stock Wt */}
                                        <td className="border p-1 text-center text-gray-400">—</td>
                                        {/* Units */}
                                        <td className="border p-1">
                                          <select 
                                            value={fab.unit} 
                                            onChange={e => updateMaterialFab(item.id, mat.id, fab.id, 'unit', e.target.value)} 
                                            className="w-full p-1 border rounded text-xs bg-green-50 dark:bg-green-950 dark:border-gray-600 dark:text-gray-100"
                                          >
                                            <option value="EA">EA</option>
                                            <option value="IN">IN</option>
                                            <option value="LF">LF</option>
                                            <option value="LB">LB</option>
                                            <option value="HR">HR</option>
                                            <option value="SF">SF</option>
                                          </select>
                                        </td>
                                        {/* Rate */}
                                        <td className="border p-1">
                                          <input 
                                            type="number" 
                                            step="0.01" 
                                            value={fab.unitPrice || ''} 
                                            onChange={e => updateMaterialFab(item.id, mat.id, fab.id, 'unitPrice', parseFloat(e.target.value) || 0)} 
                                            className="w-full p-1 border rounded text-xs text-right bg-green-50 dark:bg-green-950 dark:border-gray-600 dark:text-gray-100" 
                                            placeholder="$0.00"
                                          />
                                        </td>
                                        {/* Total */}
                                        <td className="border p-1 text-right font-semibold text-green-700">{fmtPrice(fab.totalCost || 0)}</td>
                                        {/* Actions */}
                                        <td className="border p-1 text-center">
                                          <button onClick={() => deleteMaterialFab(item.id, mat.id, fab.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>
                                        </td>
                                      </tr>
                                      );
                                    })}
                                    {/* Auto-generated galv fab row (if any) */}
                                    {(mat.fabrication || []).filter(f => f.isAutoGalv || f.isConnGalv).map(fab => (
                                      <tr key={fab.id} className="bg-yellow-50 dark:bg-yellow-950">
                                        <td className="border p-1 text-yellow-600 text-center text-xs font-medium">[Galv]</td>
                                        <td className="border p-1 text-xs text-yellow-700">{fab.description}</td>
                                        <td className="border p-1 text-center text-gray-400">—</td>
                                        <td className="border p-1 text-center text-gray-400">—</td>
                                        <td className="border p-1 text-center text-gray-400">—</td>
                                        <td className="border p-1 text-right text-xs">{fmtWt(fab.quantity)}</td>
                                        <td className="border p-1 text-center text-gray-400">—</td>
                                        <td className="border p-1 text-center text-gray-400">—</td>
                                        <td className="border p-1 text-center text-gray-400">—</td>
                                        <td className="border p-1 text-center text-gray-400">—</td>
                                        <td className="border p-1 text-center text-gray-400">—</td>
                                        <td className="border p-1 text-center text-gray-400">—</td>
                                        <td className="border p-1 text-xs text-center">LB</td>
                                        <td className="border p-1">
                                          <input 
                                            type="number" 
                                            step="0.01" 
                                            value={fab.unitPrice || ''} 
                                            onChange={e => updateMaterialFab(item.id, mat.id, fab.id, 'unitPrice', parseFloat(e.target.value) || 0)} 
                                            className="w-full p-1 border rounded text-xs text-right bg-yellow-50 dark:bg-yellow-950 dark:border-gray-600 dark:text-gray-100" 
                                            placeholder="$/lb"
                                          />
                                        </td>
                                        <td className="border p-1 text-right font-semibold text-yellow-700">{fmtPrice(fab.totalCost || 0)}</td>
                                        <td className="border p-1"></td>
                                      </tr>
                                    ))}
                                    {/* Child rows (attachments) */}
                                    {getChildMaterials(item.materials, mat.id).map(child => (
                                      <React.Fragment key={child.id}>
                                      <tr
                                        className="bg-gray-50 dark:bg-gray-800"
                                        draggable
                                        onDragStart={e => handleDragStart(e, item.id, child.id, false)}
                                        onDragOver={e => handleDragOver(e, item.id, child.id, false, child.parentMaterialId)}
                                        onDragLeave={() => setDropTarget(dt => dt?.materialId === child.id ? null : dt)}
                                        onDrop={e => handleDrop(e, item.id)}
                                        onDragEnd={handleDragEnd}
                                        style={dropTarget?.materialId === child.id ? {
                                          boxShadow: dropTarget.position === 'before'
                                            ? 'inset 0 3px 0 0 #3b82f6'
                                            : 'inset 0 -3px 0 0 #3b82f6'
                                        } : undefined}
                                      >
                                        <td className="border p-1 pl-3 text-gray-600 dark:text-gray-400 font-medium">
                                          <div className="flex items-center gap-0.5">
                                            <GripVertical size={10} className="text-gray-300 cursor-grab flex-shrink-0" />
                                            {child.sequence}
                                          </div>
                                        </td>
                                        <td className="border p-1"><input type="text" value={child.description || ''} onChange={e => updateMaterial(item.id, child.id, 'description', e.target.value)} className="w-full p-1 border rounded text-xs bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" placeholder="Attachment desc" /></td>
                                        <td className="border p-1">
                                          <select value={child.category} onChange={e => updateMaterial(item.id, child.id, 'category', e.target.value)} className="w-full p-1 border rounded text-xs bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100">
                                            {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                            <option value="Custom">Custom</option>
                                          </select>
                                        </td>
                                        <td className="border p-1">
                                          {child.category === 'Custom' ? (
                                            <input type="text" value={child.size || ''} onChange={e => updateMaterial(item.id, child.id, 'size', e.target.value)} className="w-full p-1 border rounded text-xs bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
                                          ) : child.category === 'Plate' ? (
                                            <div className="flex items-center gap-1">
                                              <select 
                                                value={child.plateThickness || ''} 
                                                onChange={e => updateMaterial(item.id, child.id, 'plateThickness', e.target.value)} 
                                                className="flex-1 p-1 border rounded text-xs bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                                              >
                                                <option value="">Thick</option>
                                                {plateThicknesses.map(t => <option key={t.label} value={t.value}>{t.label}</option>)}
                                              </select>
                                              <span className="text-gray-500 dark:text-gray-400">×</span>
                                              <input 
                                                type="number" 
                                                step="0.5" 
                                                value={child.plateWidth || ''} 
                                                onChange={e => updateMaterial(item.id, child.id, 'plateWidth', parseFloat(e.target.value) || 0)} 
                                                className="w-12 p-1 border rounded text-xs text-right bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" 
                                                placeholder="W"
                                              />
                                              <span className="text-gray-500 dark:text-gray-400 text-xs">"</span>
                                            </div>
                                          ) : (
                                            <select value={child.size} onChange={e => updateMaterial(item.id, child.id, 'size', e.target.value)} className="w-full p-1 border rounded text-xs bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100">
                                              {getShapesForCategory(child.category).map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                          )}
                                        </td>
                                        <td className="border p-1">
                                          {child.category === 'Custom' ? (
                                            <input type="number" step="0.01" value={child.customWeight || ''} onChange={e => updateMaterial(item.id, child.id, 'customWeight', parseFloat(e.target.value) || 0)} className="w-full p-1 border rounded text-xs text-right bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" />
                                          ) : child.category === 'Plate' ? (
                                            <span className="block text-right">{child.weightPerFoot?.toFixed(2) || '—'}</span>
                                          ) : (
                                            <span className="block text-right">{child.weightPerFoot?.toFixed(2)}</span>
                                          )}
                                        </td>
                                        <td className="border p-1">
                                          <div className="flex items-center justify-center gap-0.5">
                                            <button 
                                              onClick={() => updateMaterial(item.id, child.id, 'pieces', Math.max(1, (child.pieces || 1) - 1))}
                                              className="px-1 py-0.5 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 rounded text-xs font-bold"
                                            >−</button>
                                            <input 
                                              type="number" 
                                              value={child.pieces || ''} 
                                              onChange={e => updateMaterial(item.id, child.id, 'pieces', parseInt(e.target.value) || 0)} 
                                              className={`w-10 p-1 border rounded text-xs text-center dark:border-gray-600 dark:text-gray-100 ${child.inheritPieces ? 'bg-blue-50 dark:bg-blue-950 border-blue-300' : 'bg-gray-50 dark:bg-gray-800'}`}
                                              title={child.inheritPieces ? 'Inherited from parent' : 'Custom quantity'}
                                            />
                                            <button 
                                              onClick={() => updateMaterial(item.id, child.id, 'pieces', (child.pieces || 0) + 1)}
                                              className="px-1 py-0.5 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 rounded text-xs font-bold"
                                            >+</button>
                                          </div>
                                        </td>
                                        <td className="border p-1"><input type="number" step="0.01" value={child.length || ''} onChange={e => updateMaterial(item.id, child.id, 'length', parseFloat(e.target.value) || 0)} className="w-full p-1 border rounded text-xs text-right bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" placeholder="0.00" /></td>
                                        <td className="border p-1 text-right bg-blue-50 dark:bg-blue-950">{fmtWt(child.fabWeight || 0)}</td>
                                        <td className="border p-1 text-center">
                                          <input type="checkbox" checked={child.galvanized || false} 
                                            onChange={e => updateMaterial(item.id, child.id, 'galvanized', e.target.checked)} 
                                            className="w-4 h-4 rounded" title="Add Galvanizing" />
                                        </td>
                                        <td className="border p-1">
                                          <select 
                                            value={child.stockLength} 
                                            onChange={e => updateMaterial(item.id, child.id, 'stockLength', parseInt(e.target.value))} 
                                            className={`w-full p-1 border rounded text-xs bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 ${child.isManualOverride ? 'bg-yellow-50 dark:bg-yellow-950 border-yellow-400' : ''}`}
                                          >
                                            {getStockLengthsForCategory(child.category).map(sl => (
                                              <option key={sl} value={sl}>
                                                {sl}'{sl === child.optimalStockLength ? '*' : ''}
                                              </option>
                                            ))}
                                          </select>
                                        </td>
                                        <td className="border p-1 text-right bg-gray-100 dark:bg-gray-700">{child.stocksRequired || 0}</td>
                                        <td className="border p-1 text-right bg-gray-100 dark:bg-gray-700">{fmtWt(child.stockWeight || 0)}</td>
                                        <td className="border p-1">
                                          <select value={child.priceBy} onChange={e => updateMaterial(item.id, child.id, 'priceBy', e.target.value)} className="w-14 p-1 border rounded text-xs bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100">
                                            <option value="LB">LB</option><option value="LF">LF</option><option value="EA">EA</option>
                                          </select>
                                        </td>
                                        <td className="border p-1"><input type="number" step="0.01" value={child.unitPrice || ''} onChange={e => updateMaterial(item.id, child.id, 'unitPrice', parseFloat(e.target.value) || 0)} className="w-16 p-1 border rounded text-xs text-right bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" /></td>
                                        <td className="border p-1 text-right font-semibold bg-green-50 dark:bg-green-950">{fmtPrice(child.totalCost || 0)}</td>
                                        <td className="border p-1">
                                          <div className="flex gap-1">
                                            <button onClick={() => addMaterialFab(item.id, child.id)} className="text-green-600 hover:text-green-800" title="Add Fabrication"><Plus size={12} className="bg-green-100 rounded" /></button>
                                            <button onClick={() => deleteMaterial(item.id, child.id)} className="text-red-600 hover:text-red-800" title="Delete"><Trash2 size={12} /></button>
                                          </div>
                                        </td>
                                      </tr>
                                      {/* Child material fab rows */}
                                      {(child.fabrication || []).filter(f => !f.isAutoGalv && !f.isConnGalv).map(fab => {
                                        const isApplyToSelf = !fab.applyTo || fab.applyTo === 'self';
                                        const parentMat = item.materials.find(m => m.id === child.parentMaterialId);
                                        const siblingMats = item.materials.filter(m => m.parentMaterialId === child.parentMaterialId && m.id !== child.id);
                                        
                                        // Get target material for display
                                        const targetMat = !isApplyToSelf ? item.materials.find(m => m.id === fab.applyTo) : null;
                                        const targetPrefix = targetMat ? `↳ ${targetMat.sequence}: ` : '';
                                        
                                        const hasLength = (fab.unit === 'IN' || fab.unit === 'LF') && fab.length;
                                        const extLen = hasLength ? (fab.quantity || 0) * (fab.length || 0) : null;
                                        
                                        // Available operations based on applyTo
                                        const availableOps = isApplyToSelf 
                                          ? [...fabricationOperations.cutting, ...fabricationOperations.drilling, ...fabricationOperations.prep, ...fabricationOperations.welding, ...fabricationOperations.coatings, ...fabricationOperations.finishes, ...fabricationOperations.handling]
                                          : fabricationOperations.welding;
                                        
                                        return (
                                        <tr key={fab.id} className="bg-green-50 dark:bg-green-950">
                                          {/* Seq */}
                                          <td className="border p-1 text-green-600 text-center text-xs font-medium">[Fab]</td>
                                          {/* Description - shows ↳ A: prefix + operation */}
                                          <td className="border p-1">
                                            <div className="flex items-center gap-1">
                                              {!isApplyToSelf && (
                                                <select 
                                                  value={fab.applyTo || 'self'} 
                                                  onChange={e => updateMaterialFab(item.id, child.id, fab.id, 'applyTo', e.target.value === 'self' ? 'self' : parseInt(e.target.value) || e.target.value)} 
                                                  className="p-1 border rounded text-xs bg-green-100 dark:bg-gray-700 w-16 dark:border-gray-600 dark:text-gray-100"
                                                  title="Apply To"
                                                >
                                                  <option value="self">Self</option>
                                                  {parentMat && <option value={parentMat.id}>↳ {parentMat.sequence}</option>}
                                                  {siblingMats.map(m => (
                                                    <option key={m.id} value={m.id}>↳ {m.sequence}</option>
                                                  ))}
                                                </select>
                                              )}
                                              {isApplyToSelf && (
                                                <select 
                                                  value={fab.applyTo || 'self'} 
                                                  onChange={e => updateMaterialFab(item.id, child.id, fab.id, 'applyTo', e.target.value === 'self' ? 'self' : parseInt(e.target.value) || e.target.value)} 
                                                  className="p-1 border rounded text-xs bg-green-50 dark:bg-green-950 w-16 dark:border-gray-600 dark:text-gray-100"
                                                  title="Apply To"
                                                >
                                                  <option value="self">Self</option>
                                                  {parentMat && <option value={parentMat.id}>↳ {parentMat.sequence}</option>}
                                                  {siblingMats.map(m => (
                                                    <option key={m.id} value={m.id}>↳ {m.sequence}</option>
                                                  ))}
                                                </select>
                                              )}
                                              {fab.operation === 'Custom' ? (
                                                <div className="flex gap-1 items-center flex-1">
                                                  <input
                                                    type="text"
                                                    value={fab.customOperation || ''}
                                                    onChange={e => updateMaterialFab(item.id, child.id, fab.id, 'customOperation', e.target.value)}
                                                    placeholder="Custom operation..."
                                                    className="flex-1 p-1 border border-orange-300 rounded text-xs bg-orange-50"
                                                    autoFocus
                                                  />
                                                  <button onClick={() => updateMaterialFab(item.id, child.id, fab.id, 'operation', 'Welding- Fillet')} className="text-gray-400 hover:text-gray-600 text-xs px-1" title="Back to list">↩</button>
                                                </div>
                                              ) : (
                                              <select
                                                value={fab.operation}
                                                onChange={e => updateMaterialFab(item.id, child.id, fab.id, 'operation', e.target.value)}
                                                className="flex-1 p-1 border rounded text-xs bg-green-50 dark:bg-green-950 dark:border-gray-600 dark:text-gray-100"
                                              >
                                                {isApplyToSelf ? (
                                                  <>
                                                    <optgroup label="Cutting">
                                                      {fabricationOperations.cutting.map(op => <option key={op} value={op}>{op}</option>)}
                                                    </optgroup>
                                                    <optgroup label="Drilling">
                                                      {fabricationOperations.drilling.map(op => <option key={op} value={op}>{op}</option>)}
                                                    </optgroup>
                                                    <optgroup label="Prep">
                                                      {fabricationOperations.prep.map(op => <option key={op} value={op}>{op}</option>)}
                                                    </optgroup>
                                                    <optgroup label="Welding">
                                                      {fabricationOperations.welding.map(op => <option key={op} value={op}>{op}</option>)}
                                                    </optgroup>
                                                    <optgroup label="Coatings">
                                                      {fabricationOperations.coatings.map(op => <option key={op} value={op}>{op}</option>)}
                                                    </optgroup>
                                                    <optgroup label="Finishes">
                                                      {fabricationOperations.finishes.map(op => <option key={op} value={op}>{op}</option>)}
                                                    </optgroup>
                                                    <optgroup label="Handling">
                                                      {fabricationOperations.handling.map(op => <option key={op} value={op}>{op}</option>)}
                                                    </optgroup>
                                                  </>
                                                ) : (
                                                  <optgroup label="Welding">
                                                    {fabricationOperations.welding.map(op => <option key={op} value={op}>{op}</option>)}
                                                  </optgroup>
                                                )}
                                                {Object.entries(
                                                  customOps.reduce((acc, op) => {
                                                    (acc[op.category] = acc[op.category] || []).push(op);
                                                    return acc;
                                                  }, {})
                                                ).map(([cat, ops]) => (
                                                  <optgroup key={`custom-${cat}`} label={cat}>
                                                    {ops.map(op => <option key={op.name} value={op.name}>{op.name}</option>)}
                                                  </optgroup>
                                                ))}
                                                <optgroup label="Other">
                                                  <option value="Custom">— Custom —</option>
                                                </optgroup>
                                              </select>
                                              )}
                                            </div>
                                          </td>
                                          {/* Category */}
                                          <td className="border p-1 text-center text-gray-400">—</td>
                                          {/* Size */}
                                          <td className="border p-1 text-center text-gray-400">—</td>
                                          {/* Wt/ft */}
                                          <td className="border p-1 text-center text-gray-400">—</td>
                                          {/* Qty (per piece) */}
                                          <td className="border p-1">
                                            <div className="flex items-center justify-center gap-0.5">
                                              <button 
                                                onClick={() => updateMaterialFab(item.id, child.id, fab.id, 'quantity', Math.max(0, (fab.quantity || 0) - 1))}
                                                className="px-1 py-0.5 bg-green-200 hover:bg-green-300 rounded text-xs font-bold"
                                              >−</button>
                                              <input 
                                                type="number" 
                                                step="1" 
                                                value={fab.quantity || ''} 
                                                onChange={e => updateMaterialFab(item.id, child.id, fab.id, 'quantity', parseFloat(e.target.value) || 0)} 
                                                className="w-10 p-1 border rounded text-xs text-center bg-green-50 dark:bg-green-950 dark:border-gray-600 dark:text-gray-100" 
                                                placeholder="qty"
                                              />
                                              <button 
                                                onClick={() => updateMaterialFab(item.id, child.id, fab.id, 'quantity', (fab.quantity || 0) + 1)}
                                                className="px-1 py-0.5 bg-green-200 hover:bg-green-300 rounded text-xs font-bold"
                                              >+</button>
                                            </div>
                                          </td>
                                          {/* Length (per operation) */}
                                          <td className="border p-1">
                                            {(fab.unit === 'IN' || fab.unit === 'LF') ? (
                                              <input 
                                                type="number" 
                                                step="0.1" 
                                                value={fab.length || ''} 
                                                onChange={e => updateMaterialFab(item.id, child.id, fab.id, 'length', parseFloat(e.target.value) || 0)} 
                                                className="w-full p-1 border rounded text-xs text-right bg-green-50 dark:bg-green-950 dark:border-gray-600 dark:text-gray-100" 
                                                placeholder="len"
                                              />
                                            ) : (
                                              <span className="block text-center text-gray-400">—</span>
                                            )}
                                          </td>
                                          {/* Ext Len */}
                                          <td className="border p-1 text-right text-xs">
                                            {hasLength ? extLen.toFixed(1) : <span className="text-gray-400">—</span>}
                                          </td>
                                          {/* Galv */}
                                          <td className="border p-1 text-center text-gray-400">—</td>
                                          {/* Stock */}
                                          <td className="border p-1 text-center text-gray-400">—</td>
                                          {/* Stks */}
                                          <td className="border p-1 text-center text-gray-400">—</td>
                                          {/* Stock Wt */}
                                          <td className="border p-1 text-center text-gray-400">—</td>
                                          {/* Units */}
                                          <td className="border p-1">
                                            <select 
                                              value={fab.unit} 
                                              onChange={e => updateMaterialFab(item.id, child.id, fab.id, 'unit', e.target.value)} 
                                              className="w-full p-1 border rounded text-xs bg-green-50 dark:bg-green-950 dark:border-gray-600 dark:text-gray-100"
                                            >
                                              <option value="EA">EA</option>
                                              <option value="IN">IN</option>
                                              <option value="LF">LF</option>
                                              <option value="LB">LB</option>
                                              <option value="HR">HR</option>
                                              <option value="SF">SF</option>
                                            </select>
                                          </td>
                                          {/* Rate */}
                                          <td className="border p-1">
                                            <input 
                                              type="number" 
                                              step="0.01" 
                                              value={fab.unitPrice || ''} 
                                              onChange={e => updateMaterialFab(item.id, child.id, fab.id, 'unitPrice', parseFloat(e.target.value) || 0)} 
                                              className="w-full p-1 border rounded text-xs text-right bg-green-50 dark:bg-green-950 dark:border-gray-600 dark:text-gray-100" 
                                              placeholder="$0.00"
                                            />
                                          </td>
                                          {/* Total */}
                                          <td className="border p-1 text-right font-semibold text-green-700">{fmtPrice(fab.totalCost || 0)}</td>
                                          {/* Actions */}
                                          <td className="border p-1 text-center">
                                            <button onClick={() => deleteMaterialFab(item.id, child.id, fab.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>
                                          </td>
                                        </tr>
                                        );
                                      })}
                                      {/* Auto-generated galv fab row for child (if any) */}
                                      {(child.fabrication || []).filter(f => f.isAutoGalv || f.isConnGalv).map(fab => (
                                        <tr key={fab.id} className="bg-yellow-50 dark:bg-yellow-950">
                                          <td className="border p-1 text-yellow-600 text-center text-xs font-medium">[Galv]</td>
                                          <td className="border p-1 text-xs text-yellow-700">{fab.description}</td>
                                          <td className="border p-1 text-center text-gray-400">—</td>
                                          <td className="border p-1 text-center text-gray-400">—</td>
                                          <td className="border p-1 text-center text-gray-400">—</td>
                                          <td className="border p-1 text-right text-xs">{fmtWt(fab.quantity)}</td>
                                          <td className="border p-1 text-center text-gray-400">—</td>
                                          <td className="border p-1 text-center text-gray-400">—</td>
                                          <td className="border p-1 text-center text-gray-400">—</td>
                                          <td className="border p-1 text-center text-gray-400">—</td>
                                          <td className="border p-1 text-center text-gray-400">—</td>
                                          <td className="border p-1 text-center text-gray-400">—</td>
                                          <td className="border p-1 text-xs text-center">LB</td>
                                          <td className="border p-1">
                                            <input 
                                              type="number" 
                                              step="0.01" 
                                              value={fab.unitPrice || ''} 
                                              onChange={e => updateMaterialFab(item.id, child.id, fab.id, 'unitPrice', parseFloat(e.target.value) || 0)} 
                                              className="w-full p-1 border rounded text-xs text-right bg-yellow-50 dark:bg-yellow-950 dark:border-gray-600 dark:text-gray-100" 
                                              placeholder="$/lb"
                                            />
                                          </td>
                                          <td className="border p-1 text-right font-semibold text-yellow-700">{fmtPrice(fab.totalCost || 0)}</td>
                                          <td className="border p-1"></td>
                                        </tr>
                                      ))}
                                      </React.Fragment>
                                    ))}
                                  </React.Fragment>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* Item-Level Fabrication (General) */}
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <h3 className="font-semibold text-gray-800 dark:text-gray-200">Item Fabrication (General)</h3>
                          <button onClick={() => addFabrication(item.id)} className="flex items-center gap-1 bg-green-600 text-white px-2 py-1 rounded text-xs"><Plus size={14} /> Add General Fab</button>
                        </div>
                        {item.fabrication.length > 0 && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs border-collapse">
                              <thead>
                                <tr className="bg-gray-100 dark:bg-gray-700">
                                  <th className="border p-1 text-left">Operation</th>
                                  <th className="border p-1 text-left">Description</th>
                                  <th className="border p-1 text-right">Qty</th>
                                  <th className="border p-1 text-left">Unit</th>
                                  <th className="border p-1 text-right">Rate</th>
                                  <th className="border p-1 text-right">Total</th>
                                  <th className="border p-1"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {item.fabrication.map(fab => (
                                  <tr key={fab.id}>
                                    <td className="border p-1">
                                      {fab.operation === 'Custom' ? (
                                        <div className="flex gap-1 items-center">
                                          <input
                                            type="text"
                                            value={fab.customOperation || ''}
                                            onChange={e => updateFabrication(item.id, fab.id, 'customOperation', e.target.value)}
                                            placeholder="Custom operation..."
                                            className="flex-1 p-1 border border-orange-300 rounded text-xs bg-orange-50"
                                            autoFocus
                                          />
                                          <button onClick={() => updateFabrication(item.id, fab.id, 'operation', 'Handling')} className="text-gray-400 hover:text-gray-600 text-xs px-1" title="Back to list">↩</button>
                                        </div>
                                      ) : (
                                      <select value={fab.operation} onChange={e => updateFabrication(item.id, fab.id, 'operation', e.target.value)} className="w-full p-1 border rounded text-xs dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100">
                                        <optgroup label="Handling">
                                          {fabricationOperations.handling.map(op => <option key={op} value={op}>{op}</option>)}
                                        </optgroup>
                                        <optgroup label="Coatings">
                                          {fabricationOperations.coatings.map(op => <option key={op} value={op}>{op}</option>)}
                                        </optgroup>
                                        <optgroup label="Finishes">
                                          {fabricationOperations.finishes.map(op => <option key={op} value={op}>{op}</option>)}
                                        </optgroup>
                                        <optgroup label="Cutting">
                                          {fabricationOperations.cutting.map(op => <option key={op} value={op}>{op}</option>)}
                                        </optgroup>
                                        <optgroup label="Drilling">
                                          {fabricationOperations.drilling.map(op => <option key={op} value={op}>{op}</option>)}
                                        </optgroup>
                                        <optgroup label="Prep">
                                          {fabricationOperations.prep.map(op => <option key={op} value={op}>{op}</option>)}
                                        </optgroup>
                                        <optgroup label="Welding">
                                          {fabricationOperations.welding.map(op => <option key={op} value={op}>{op}</option>)}
                                        </optgroup>
                                        <optgroup label="Other">
                                          <option value="Custom">— Custom —</option>
                                        </optgroup>
                                      </select>
                                      )}
                                    </td>
                                    <td className="border p-1"><input type="text" value={fab.description || ''} onChange={e => updateFabrication(item.id, fab.id, 'description', e.target.value)} className="w-full p-1 border rounded text-xs dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" placeholder="description" /></td>
                                    <td className="border p-1"><input type="number" step="0.1" value={fab.quantity || ''} onChange={e => updateFabrication(item.id, fab.id, 'quantity', parseFloat(e.target.value) || 0)} className="w-16 p-1 border rounded text-xs text-right dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" placeholder="qty" /></td>
                                    <td className="border p-1">
                                      <select value={fab.unit} onChange={e => updateFabrication(item.id, fab.id, 'unit', e.target.value)} className="w-14 p-1 border rounded text-xs dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100">
                                        <option value="EA">EA</option><option value="HR">HR</option><option value="LF">LF</option><option value="LB">LB</option><option value="SF">SF</option><option value="LS">LS</option>
                                      </select>
                                    </td>
                                    <td className="border p-1"><input type="number" step="0.01" value={fab.unitPrice || ''} onChange={e => updateFabrication(item.id, fab.id, 'unitPrice', parseFloat(e.target.value) || 0)} className="w-16 p-1 border rounded text-xs text-right dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" placeholder="$0.00" /></td>
                                    <td className="border p-1 text-right font-semibold bg-green-50 dark:bg-green-950">{fmtPrice(fab.totalCost || 0)}</td>
                                    <td className="border p-1"><button onClick={() => deleteFabrication(item.id, fab.id)} className="text-red-600"><Trash2 size={12} /></button></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* Item Summary + Snapshots */}
                      <div className="bg-gray-200 dark:bg-gray-600 rounded p-3 mt-2 flex gap-4 items-start">

                        {/* Blueprint Snapshots — left panel */}
                        <div
                          className="flex-1 min-w-0"
                          onPaste={(e) => handleSnapshotPaste(item.id, e)}
                        >
                          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Blueprint Snapshots</div>
                          <div className="flex flex-wrap gap-2">
                            {(item.snapshots || []).map(snap => (
                              <div key={snap.id} className="relative group w-28">
                                <img
                                  src={snap.imageData}
                                  alt={snap.caption || 'Snapshot'}
                                  className="w-28 h-20 object-cover rounded border border-gray-300 dark:border-gray-600 cursor-pointer hover:opacity-90"
                                  onClick={() => setLightboxSrc(snap.imageData)}
                                />
                                <button
                                  onClick={() => removeSnapshot(item.id, snap.id)}
                                  className="absolute top-0.5 right-0.5 bg-red-600 text-white rounded-full w-4 h-4 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity leading-none"
                                  title="Remove"
                                >×</button>
                                <input
                                  type="text"
                                  value={snap.caption}
                                  onChange={e => updateSnapshotCaption(item.id, snap.id, e.target.value)}
                                  placeholder="Caption..."
                                  className="w-full mt-0.5 p-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900"
                                />
                              </div>
                            ))}

                            {/* Add snapshot cell */}
                            <label className="w-28 h-20 flex flex-col items-center justify-center border-2 border-dashed border-gray-400 dark:border-gray-500 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 text-xs gap-1">
                              <span className="text-2xl leading-none">+</span>
                              <span>Add Image</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="sr-only"
                                onChange={async (e) => {
                                  if (e.target.files[0]) {
                                    await addSnapshot(item.id, e.target.files[0]);
                                    e.target.value = '';
                                  }
                                }}
                              />
                            </label>
                          </div>
                          <div className="text-xs text-gray-400 mt-1">Ctrl+V to paste from clipboard</div>
                        </div>

                        {/* Cost Summary — right panel */}
                        <div className="shrink-0">
                        <div className="grid grid-cols-2 gap-y-1 text-xs">
                          <div className="text-right text-gray-600 dark:text-gray-400 pr-2">Total Fab Wt:</div>
                          <div className="text-right text-blue-800 font-bold">
                            {fmtWt(
                              item.materials.reduce((sum, m) => sum + (m.fabWeight || 0), 0) +
                              item.materials.reduce((sum, m) => 
                                sum + ((m.fabrication || []).reduce((fs, f) => 
                                  fs + (CONNECTION_WEIGHT_OPS.has(f.operation) && f.connWeight
                                    ? (f.quantity || 0) * f.connWeight 
                                    : 0), 0)), 0)
                            )} lbs
                          </div>

                          <div className="text-right text-gray-600 dark:text-gray-400 pr-2">Material Cost:</div>
                          <div className="text-right text-gray-700 dark:text-gray-300 font-semibold">
                            {fmtPrice(item.materials.reduce((sum, m) => sum + (m.totalCost || 0), 0))}
                          </div>

                          <div className="text-right text-gray-600 dark:text-gray-400 pr-2 flex items-center justify-end gap-1">
                            Material Markup
                            <input 
                              type="number" 
                              step="0.5" 
                              value={item.materialMarkup || ''} 
                              onChange={e => updateItem(item.id, 'materialMarkup', parseFloat(e.target.value) || 0)} 
                              className="w-14 p-1 border rounded text-xs text-right dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" 
                              placeholder="0"
                            />%:
                          </div>
                          <div className="text-right text-gray-700 dark:text-gray-300 font-semibold">
                            {fmtPrice(item.materials.reduce((sum, m) => sum + (m.totalCost || 0), 0) * (item.materialMarkup || 0) / 100)}
                          </div>

                          <div className="text-right text-gray-600 dark:text-gray-400 pr-2 pt-1 border-t border-gray-300 dark:border-gray-600">Fabrication Cost:</div>
                          <div className="text-right text-gray-700 dark:text-gray-300 font-semibold pt-1 border-t border-gray-300 dark:border-gray-600">
                            {fmtPrice(
                              item.materials.reduce((sum, m) => sum + ((m.fabrication || []).reduce((fs, f) => fs + (f.totalCost || 0), 0)), 0) +
                              item.fabrication.reduce((sum, f) => sum + (f.totalCost || 0), 0)
                            )}
                          </div>

                          <div className="text-right text-gray-600 dark:text-gray-400 pr-2 flex items-center justify-end gap-1">
                            Fab Markup
                            <input 
                              type="number" 
                              step="0.5" 
                              value={item.fabMarkup || ''} 
                              onChange={e => updateItem(item.id, 'fabMarkup', parseFloat(e.target.value) || 0)} 
                              className="w-14 p-1 border rounded text-xs text-right dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" 
                              placeholder="0"
                            />%:
                          </div>
                          <div className="text-right text-gray-700 dark:text-gray-300 font-semibold">
                            {fmtPrice(
                              (item.materials.reduce((sum, m) => sum + ((m.fabrication || []).reduce((fs, f) => fs + (f.totalCost || 0), 0)), 0) +
                              item.fabrication.reduce((sum, f) => sum + (f.totalCost || 0), 0)) * (item.fabMarkup || 0) / 100
                            )}
                          </div>

                          <div className="text-right text-green-800 font-bold pr-2 pt-1 border-t-2 border-gray-400 dark:border-gray-500">Total Item Cost:</div>
                          <div className="text-right text-green-800 font-bold pt-1 border-t-2 border-gray-400 dark:border-gray-500">
                            {fmtPrice(
                              // Material cost with material markup
                              (item.materials.reduce((sum, m) => sum + (m.totalCost || 0), 0)) * (1 + (item.materialMarkup || 0) / 100) +
                              // Fab cost with fab markup
                              (item.materials.reduce((sum, m) => sum + ((m.fabrication || []).reduce((fs, f) => fs + (f.totalCost || 0), 0)), 0) +
                              item.fabrication.reduce((sum, f) => sum + (f.totalCost || 0), 0)) * (1 + (item.fabMarkup || 0) / 100)
                            )}
                          </div>
                        </div>
                        </div>{/* end shrink-0 cost panel */}
                      </div>{/* end flex grey band */}
                    </div>
                  )}
                </div>
              ))}
              <button onClick={addItem} className="w-full p-3 border-2 border-dashed border-gray-400 dark:border-gray-500 rounded text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center gap-2">
                <Plus size={18} /> Add New Item
              </button>

              {/* Totals */}
              <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded border grid grid-cols-2 md:grid-cols-7 gap-4">
                <div className="text-right"><span className="text-xs text-gray-600 dark:text-gray-400">Total Fab Wt: </span><span className="text-lg font-bold text-blue-700">{fmtWt(totals.totalFabWeight + totals.totalConnectionWeight)} lbs</span></div>
                <div className="text-right"><span className="text-xs text-gray-600 dark:text-gray-400">Stock Weight: </span><span className="text-lg font-bold">{fmtWt(totals.totalStockWeight)} lbs</span></div>
                <div className="text-right"><span className="text-xs text-gray-600 dark:text-gray-400">Material: </span><span className="text-lg font-bold">{fmtPrice(totals.totalMaterialCost)}</span></div>
                <div className="text-right"><span className="text-xs text-gray-600 dark:text-gray-400">Mat Markup: </span><span className="text-lg font-bold">{fmtPrice(totals.totalMaterialMarkup)}</span></div>
                <div className="text-right"><span className="text-xs text-gray-600 dark:text-gray-400">Fabrication: </span><span className="text-lg font-bold">{fmtPrice(totals.totalFabricationCost)}</span></div>
                <div className="text-right"><span className="text-xs text-gray-600 dark:text-gray-400">Fab Markup: </span><span className="text-lg font-bold">{fmtPrice(totals.totalFabMarkup)}</span></div>
                <div className="text-right"><span className="text-xs text-gray-600 dark:text-gray-400">Grand Total: </span><span className="text-xl font-bold text-green-700">{fmtPrice(totals.grandTotal)}</span></div>
              </div>
            </div>
          )}

          {/* STOCK LIST TAB */}
          {activeTab === 'stocklist' && (
            <div className="space-y-4">
              <div className="bg-gray-700 dark:bg-gray-600 text-white p-4 rounded flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold">Stock Material Buy List</h2>
                  <p className="text-sm text-gray-300">{projectName || 'Project'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded font-semibold hover:bg-green-700 cursor-pointer text-sm">
                    <Upload size={16} />
                    Upload Vendor CSV
                    <input type="file" accept=".csv" className="hidden" onChange={handleRfqPricingUpload} />
                  </label>
                  <button
                    onClick={() => setShowRfqModal(true)}
                    className="bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 px-4 py-2 rounded font-semibold hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Request Vendor Pricing
                  </button>
                </div>
              </div>
              {rfqUploadResult && (
                <div className={`text-sm px-3 py-2 rounded ${rfqUploadResult.error ? 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400' : 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400'}`}>
                  {rfqUploadResult.error
                    ? rfqUploadResult.error
                    : <>✓ Pricing applied to {rfqUploadResult.matched} of {rfqUploadResult.total} shapes.
                        {rfqUploadResult.unmatched?.length > 0 && <span className="text-amber-600 dark:text-amber-400"> Not matched: {rfqUploadResult.unmatched.join(', ')}</span>}</>
                  }
                </div>
              )}
              
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-200 dark:bg-gray-600">
                    <th className="border p-2 text-left">Size</th>
                    <th className="border p-2 text-right">Stock Length</th>
                    <th className="border p-2 text-right">Qty Stocks</th>
                    <th className="border p-2 text-right">Wt/ft</th>
                    <th className="border p-2 text-right">Total Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {stockList.map((stock, i) => (
                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="border p-2 font-semibold">{stock.size}</td>
                      <td className="border p-2 text-right">{stock.stockLength}'</td>
                      <td className="border p-2 text-right font-bold">{stock.totalStocks}</td>
                      <td className="border p-2 text-right">{stock.weightPerFoot.toFixed(2)}</td>
                      <td className="border p-2 text-right font-semibold">{fmtWt(stock.totalWeight)} lbs</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-200 dark:bg-gray-600 font-bold">
                    <td className="border p-2" colSpan={4}>TOTAL</td>
                    <td className="border p-2 text-right">{fmtWt(totals.totalStockWeight)} lbs</td>
                  </tr>
                </tfoot>
              </table>

              {/* RFQ Modal */}
              {showRfqModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto m-4">
                    <div className="bg-gray-700 dark:bg-gray-600 text-white p-4 rounded-t-lg flex justify-between items-center">
                      <h3 className="text-lg font-bold">Request for Quotation (RFQ)</h3>
                      <button onClick={() => { setShowRfqModal(false); setRfqUploadResult(null); }} className="text-white hover:text-gray-300 text-2xl">&times;</button>
                    </div>
                    
                    <div className="p-6 space-y-6">
                      {/* Project Info Summary */}
                      <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded border">
                        <h4 className="font-semibold mb-2">Project Information</h4>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <p><span className="text-gray-600 dark:text-gray-400">Project:</span> {projectName || 'Not specified'}</p>
                          <p><span className="text-gray-600 dark:text-gray-400">Location:</span> {projectAddress || 'Not specified'}</p>
                        </div>
                      </div>

                      {/* RFQ Details */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Quote Needed By</label>
                          <input 
                            type="date" 
                            value={rfqResponseDate} 
                            onChange={e => setRfqResponseDate(e.target.value)}
                            className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Delivery Required By</label>
                          <input 
                            type="date" 
                            value={rfqDeliveryDate} 
                            onChange={e => setRfqDeliveryDate(e.target.value)}
                            className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                          />
                        </div>
                      </div>

                      {/* Material Summary */}
                      <div>
                        <h4 className="font-semibold mb-2">Material Summary ({stockList.length} items, {fmtWt(totals.totalStockWeight)} lbs total)</h4>
                        <div className="max-h-48 overflow-y-auto border rounded">
                          <table className="w-full text-xs">
                            <thead className="bg-gray-100 dark:bg-gray-700 sticky top-0">
                              <tr>
                                <th className="p-2 text-left">Size</th>
                                <th className="p-2 text-right">Length</th>
                                <th className="p-2 text-right">Qty</th>
                                <th className="p-2 text-right">Wt/ft</th>
                                <th className="p-2 text-right">Est. Weight</th>
                              </tr>
                            </thead>
                            <tbody>
                              {stockList.map((stock, i) => (
                                <tr key={i} className="border-t">
                                  <td className="p-2">{stock.size}</td>
                                  <td className="p-2 text-right">{stock.stockLength}'</td>
                                  <td className="p-2 text-right">{stock.totalStocks}</td>
                                  <td className="p-2 text-right">{stock.weightPerFoot.toFixed(2)}</td>
                                  <td className="p-2 text-right">{fmtWt(stock.totalWeight)} lbs</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Special Instructions */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Special Instructions / Notes</label>
                        <textarea 
                          value={rfqNotes}
                          onChange={e => setRfqNotes(e.target.value)}
                          className="w-full p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                          rows={3}
                          placeholder="Mill certs required, specific mill preferences, delivery instructions, etc."
                        />
                      </div>

                      {/* Vendor List */}
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="font-semibold">Vendor Contact List</h4>
                          <button 
                            onClick={addRfqVendor}
                            className="text-sm bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded hover:bg-gray-300"
                          >
                            + Add Vendor
                          </button>
                        </div>
                        <div className="space-y-2">
                          {rfqVendors.map((vendor, i) => (
                            <div key={vendor.id} className="grid grid-cols-12 gap-2 items-center">
                              <input 
                                type="text" 
                                placeholder="Vendor Name"
                                value={vendor.name}
                                onChange={e => updateRfqVendor(vendor.id, 'name', e.target.value)}
                                className="col-span-4 p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                              />
                              <input 
                                type="email" 
                                placeholder="Email"
                                value={vendor.email}
                                onChange={e => updateRfqVendor(vendor.id, 'email', e.target.value)}
                                className="col-span-4 p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                              />
                              <input 
                                type="tel" 
                                placeholder="Phone"
                                value={vendor.phone}
                                onChange={e => updateRfqVendor(vendor.id, 'phone', e.target.value)}
                                className="col-span-3 p-2 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                              />
                              <button 
                                onClick={() => removeRfqVendor(vendor.id)}
                                className="col-span-1 text-red-600 hover:text-red-800"
                                disabled={rfqVendors.length <= 1}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Export Options */}
                      <div className="border-t pt-4">
                        <h4 className="font-semibold mb-3">Export Options</h4>
                        <div className="grid grid-cols-3 gap-4">
                          <button 
                            onClick={copyRfqToClipboard}
                            className="flex flex-col items-center gap-2 p-4 border-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-400"
                          >
                            <Copy size={24} className="text-gray-600 dark:text-gray-400" />
                            <span className="font-medium">Copy to Clipboard</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">Paste into email</span>
                          </button>
                          <button 
                            onClick={downloadRfqCsv}
                            className="flex flex-col items-center gap-2 p-4 border-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-400"
                          >
                            <Download size={24} className="text-gray-600 dark:text-gray-400" />
                            <span className="font-medium">Download CSV</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">Opens in Excel</span>
                          </button>
                          <button 
                            onClick={() => {
                              setShowRfqModal(false);
                              setActiveTab('rfqprint');
                            }}
                            className="flex flex-col items-center gap-2 p-4 border-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-400"
                          >
                            <FileText size={24} className="text-gray-600 dark:text-gray-400" />
                            <span className="font-medium">Print RFQ</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">Professional format</span>
                          </button>
                        </div>
                      </div>

                      {/* Import Vendor Response */}
                      <div className="border-t pt-4">
                        <h4 className="font-semibold mb-1">Import Vendor Response</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Upload the completed RFQ CSV to apply vendor pricing to the estimate.</p>
                        <div className="flex items-center gap-3 flex-wrap">
                          <label className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 cursor-pointer text-sm font-medium">
                            <Upload size={16} />
                            Upload Vendor CSV
                            <input type="file" accept=".csv" className="hidden" onChange={handleRfqPricingUpload} />
                          </label>
                          {rfqUploadResult && (
                            rfqUploadResult.error
                              ? <p className="text-sm text-red-600">{rfqUploadResult.error}</p>
                              : <p className="text-sm text-green-700">
                                  ✓ Pricing applied to {rfqUploadResult.matched} of {rfqUploadResult.total} shapes.
                                  {rfqUploadResult.unmatched.length > 0 && (
                                    <span className="text-amber-600"> Not matched: {rfqUploadResult.unmatched.join(', ')}</span>
                                  )}
                                </p>
                          )}
                        </div>
                      </div>

                    </div>

                    <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-b-lg flex justify-end gap-2">
                      <button
                        onClick={() => { setShowRfqModal(false); setRfqUploadResult(null); }}
                        className="px-4 py-2 border rounded hover:bg-gray-200"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* RFQ PRINT TAB (hidden from tab bar) */}
          {activeTab === 'rfqprint' && (
            <div className="bg-white dark:bg-gray-900 max-w-4xl mx-auto" style={{ padding: '0.5in' }}>
              <style>{`
                @media print {
                  body * { visibility: hidden; }
                  .rfq-printable, .rfq-printable * { visibility: visible; }
                  .rfq-printable { position: absolute; left: 0; top: 0; width: 8.5in; }
                  .no-print { display: none !important; }
                }
              `}</style>
              
              <div className="rfq-printable">
                <div className="text-center border-b-2 border-gray-800 pb-4 mb-6">
                  <h1 className="text-2xl font-bold">REQUEST FOR QUOTATION</h1>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                  <div>
                    <p><span className="font-semibold">Date:</span> {new Date().toLocaleDateString()}</p>
                    <p><span className="font-semibold">Project:</span> {projectName || '_______________'}</p>
                    <p><span className="font-semibold">Location:</span> {projectAddress || '_______________'}</p>
                  </div>
                  <div>
                    <p><span className="font-semibold">Quote Needed By:</span> {rfqResponseDate ? new Date(rfqResponseDate).toLocaleDateString() : '_______________'}</p>
                    <p><span className="font-semibold">Delivery Required:</span> {rfqDeliveryDate ? new Date(rfqDeliveryDate).toLocaleDateString() : '_______________'}</p>
                    <p><span className="font-semibold">Contact:</span> {estimatedBy || '_______________'}</p>
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="font-bold border-b border-gray-400 dark:border-gray-500 pb-1 mb-2">MATERIAL LIST</h3>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-200 dark:bg-gray-600">
                        <th className="border border-gray-400 dark:border-gray-500 p-2 text-left">Size</th>
                        <th className="border border-gray-400 dark:border-gray-500 p-2 text-center">Length</th>
                        <th className="border border-gray-400 dark:border-gray-500 p-2 text-center">Qty</th>
                        <th className="border border-gray-400 dark:border-gray-500 p-2 text-center">Wt/ft</th>
                        <th className="border border-gray-400 dark:border-gray-500 p-2 text-center">Est. Weight</th>
                        <th className="border border-gray-400 dark:border-gray-500 p-2 text-center">Your $/LB</th>
                        <th className="border border-gray-400 dark:border-gray-500 p-2 text-center">Your Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockList.map((stock, i) => (
                        <tr key={i}>
                          <td className="border border-gray-400 dark:border-gray-500 p-2">{stock.size}</td>
                          <td className="border border-gray-400 dark:border-gray-500 p-2 text-center">{stock.stockLength}'</td>
                          <td className="border border-gray-400 dark:border-gray-500 p-2 text-center">{stock.totalStocks}</td>
                          <td className="border border-gray-400 dark:border-gray-500 p-2 text-center">{stock.weightPerFoot.toFixed(2)}</td>
                          <td className="border border-gray-400 dark:border-gray-500 p-2 text-center">{fmtWt(stock.totalWeight)} lbs</td>
                          <td className="border border-gray-400 dark:border-gray-500 p-2 text-center">$</td>
                          <td className="border border-gray-400 dark:border-gray-500 p-2 text-center">$</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-200 dark:bg-gray-600 font-bold">
                        <td className="border border-gray-400 dark:border-gray-500 p-2" colSpan={4}>TOTALS</td>
                        <td className="border border-gray-400 dark:border-gray-500 p-2 text-center">{fmtWt(totals.totalStockWeight)} lbs</td>
                        <td className="border border-gray-400 dark:border-gray-500 p-2"></td>
                        <td className="border border-gray-400 dark:border-gray-500 p-2">$</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {rfqNotes && (
                  <div className="mb-6">
                    <h3 className="font-bold border-b border-gray-400 dark:border-gray-500 pb-1 mb-2">SPECIAL INSTRUCTIONS</h3>
                    <p className="text-sm">{rfqNotes}</p>
                  </div>
                )}

                <div className="mb-6 p-4 border-2 border-gray-800">
                  <h3 className="font-bold mb-3">VENDOR QUOTE SUMMARY</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="mb-2">Total Material Price: $_______________</p>
                      <p className="mb-2">Delivery Charge: $_______________</p>
                      <p className="font-bold">TOTAL QUOTE: $_______________</p>
                    </div>
                    <div>
                      <p className="mb-2">Lead Time: _______________ days</p>
                      <p className="mb-2">Quote Valid Until: _______________</p>
                      <p className="mb-2">Mill Certs Included: Yes / No</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-8 mt-8">
                  <div>
                    <p className="text-sm mb-1">Vendor Company:</p>
                    <div className="border-b border-gray-800 w-full mb-4"></div>
                    <p className="text-sm mb-1">Vendor Rep:</p>
                    <div className="border-b border-gray-800 w-full mb-4"></div>
                    <p className="text-sm mb-1">Phone:</p>
                    <div className="border-b border-gray-800 w-full mb-4"></div>
                    <p className="text-sm mb-1">Email:</p>
                    <div className="border-b border-gray-800 w-full"></div>
                  </div>
                  <div>
                    <p className="text-sm mb-1">Signature:</p>
                    <div className="border-b border-gray-800 w-full mt-8 mb-4"></div>
                    <p className="text-sm mb-1">Date:</p>
                    <div className="border-b border-gray-800 w-full"></div>
                  </div>
                </div>
              </div>

              <div className="no-print mt-6 flex justify-center gap-4">
                <button 
                  onClick={() => setActiveTab('stocklist')}
                  className="px-4 py-2 border rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Back to Stock List
                </button>
                <button 
                  onClick={() => window.print()}
                  className="bg-gray-700 dark:bg-gray-600 text-white px-6 py-2 rounded hover:bg-gray-800"
                >
                  Print RFQ
                </button>
              </div>
            </div>
          )}

          {/* RECAP TAB */}
          {activeTab === 'recap' && (
            <div className="space-y-4">
              <div className="bg-gray-700 dark:bg-gray-600 text-white p-4 rounded flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold">Cost Recap by Item</h2>
                  <p className="text-sm text-gray-300">Assign installation, drafting, engineering, PM, shipping, and custom costs with markups</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="New column name..."
                    className="px-2 py-1 rounded text-gray-800 dark:text-gray-200 text-sm w-40"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && e.target.value.trim()) {
                        addCustomRecapColumn(e.target.value);
                        e.target.value = '';
                      }
                    }}
                  />
                  <button
                    onClick={e => {
                      const input = e.target.previousSibling;
                      if (input.value.trim()) {
                        addCustomRecapColumn(input.value);
                        input.value = '';
                      }
                    }}
                    className="bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 px-3 py-1 rounded text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    + Add Column
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-200 dark:bg-gray-600">
                      <th className="border p-2 text-left" rowSpan={2}>Item</th>
                      <th className="border p-2 text-center" colSpan={2}>Installation</th>
                      <th className="border p-2 text-center" colSpan={2}>Drafting</th>
                      <th className="border p-2 text-center" colSpan={2}>Engineering</th>
                      <th className="border p-2 text-center" colSpan={2}>Project Mgmt</th>
                      <th className="border p-2 text-center" colSpan={2}>Shipping</th>
                      {customRecapColumns.map(col => (
                        <th key={col.key} className="border p-2 text-center bg-blue-100" colSpan={2}>
                          <div className="flex items-center justify-center gap-1">
                            <span>{col.name}</span>
                            <button onClick={() => removeCustomRecapColumn(col.key)} className="text-red-500 hover:text-red-700 text-xs ml-1" title="Remove column">×</button>
                          </div>
                        </th>
                      ))}
                      {taxCategory && (
                        <th className="border p-2 text-center bg-amber-100" rowSpan={2}>
                          <div className="text-xs">
                            <div className="font-bold">Tax ({(TAX_RATE * 100).toFixed(2)}%)</div>
                            <div className="font-normal text-amber-700">{taxCategoryDescriptions[taxCategory].label}</div>
                          </div>
                        </th>
                      )}
                      <th className="border p-2 text-right" rowSpan={2}>Item Total</th>
                    </tr>
                    <tr className="bg-gray-100 dark:bg-gray-700">
                      <th className="border p-1 text-center text-xs">Cost</th>
                      <th className="border p-1 text-center text-xs">Markup %</th>
                      <th className="border p-1 text-center text-xs">Cost</th>
                      <th className="border p-1 text-center text-xs">Markup %</th>
                      <th className="border p-1 text-center text-xs">Cost</th>
                      <th className="border p-1 text-center text-xs">Markup %</th>
                      <th className="border p-1 text-center text-xs">Hrs</th>
                      <th className="border p-1 text-center text-xs">$/Hr</th>
                      <th className="border p-1 text-center text-xs">Cost</th>
                      <th className="border p-1 text-center text-xs">Markup %</th>
                      {customRecapColumns.map(col => (
                        <React.Fragment key={col.key}>
                          <th className="border p-1 text-center text-xs bg-blue-50 dark:bg-blue-950">Cost</th>
                          <th className="border p-1 text-center text-xs bg-blue-50 dark:bg-blue-950">Markup %</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => {
                      const matCost = item.materials.reduce((s, m) => s + (m.totalCost || 0), 0);
                      const matMarkupAmt = matCost * (item.materialMarkup || 0) / 100;
                      const matFabCost = item.materials.reduce((s, m) => s + ((m.fabrication || []).reduce((fs, f) => fs + (f.totalCost || 0), 0)), 0);
                      const itemFabCost = item.fabrication.reduce((s, f) => s + (f.totalCost || 0), 0);
                      const fabCost = matFabCost + itemFabCost;
                      const fabMarkupAmt = fabCost * (item.fabMarkup || 0) / 100;
                      const recapTotal = Object.values(item.recapCosts).reduce((s, c) => s + (c.total || 0), 0);
                      const itemTax = calculateItemTax(item);
                      const itemTotal = matCost + matMarkupAmt + fabCost + fabMarkupAmt + recapTotal + itemTax;
                      
                      return (
                        <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                          <td className="border p-2">
                            <span className="font-mono text-xs">{item.itemNumber}</span> - <span className="font-semibold">{item.itemName}</span>
                            <div className="text-xs text-gray-500 dark:text-gray-400">Mat: {fmtPrice(matCost)}{matMarkupAmt > 0 ? ` (+${fmtPrice(matMarkupAmt)})` : ''} | Fab: {fmtPrice(fabCost)}{fabMarkupAmt > 0 ? ` (+${fmtPrice(fabMarkupAmt)})` : ''}</div>
                          </td>
                          <td className="border p-1"><input type="number" step="1" value={item.recapCosts.installation?.cost || ''} onChange={e => updateRecapCost(item.id, 'installation', 'cost', e.target.value)} className="w-16 p-1 border rounded text-xs text-center dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" /></td>
                          <td className="border p-1"><input type="number" step="1" value={item.recapCosts.installation?.markup || ''} onChange={e => updateRecapCost(item.id, 'installation', 'markup', e.target.value)} className="w-14 p-1 border rounded text-xs text-center dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" /></td>
                          <td className="border p-1"><input type="number" step="1" value={item.recapCosts.drafting?.cost || ''} onChange={e => updateRecapCost(item.id, 'drafting', 'cost', e.target.value)} className="w-16 p-1 border rounded text-xs text-center dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" /></td>
                          <td className="border p-1"><input type="number" step="1" value={item.recapCosts.drafting?.markup || ''} onChange={e => updateRecapCost(item.id, 'drafting', 'markup', e.target.value)} className="w-14 p-1 border rounded text-xs text-center dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" /></td>
                          <td className="border p-1"><input type="number" step="1" value={item.recapCosts.engineering?.cost || ''} onChange={e => updateRecapCost(item.id, 'engineering', 'cost', e.target.value)} className="w-16 p-1 border rounded text-xs text-center dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" /></td>
                          <td className="border p-1"><input type="number" step="1" value={item.recapCosts.engineering?.markup || ''} onChange={e => updateRecapCost(item.id, 'engineering', 'markup', e.target.value)} className="w-14 p-1 border rounded text-xs text-center dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" /></td>
                          <td className="border p-1"><input type="number" step="0.5" value={item.recapCosts.projectManagement?.hours || ''} onChange={e => updateRecapCost(item.id, 'projectManagement', 'hours', e.target.value)} className="w-14 p-1 border rounded text-xs text-center dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" /></td>
                          <td className="border p-1"><input type="number" step="1" value={item.recapCosts.projectManagement?.rate || ''} onChange={e => updateRecapCost(item.id, 'projectManagement', 'rate', e.target.value)} className="w-14 p-1 border rounded text-xs text-center dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" /></td>
                          <td className="border p-1"><input type="number" step="1" value={item.recapCosts.shipping?.cost || ''} onChange={e => updateRecapCost(item.id, 'shipping', 'cost', e.target.value)} className="w-16 p-1 border rounded text-xs text-center dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" /></td>
                          <td className="border p-1"><input type="number" step="1" value={item.recapCosts.shipping?.markup || ''} onChange={e => updateRecapCost(item.id, 'shipping', 'markup', e.target.value)} className="w-14 p-1 border rounded text-xs text-center dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100" /></td>
                          {customRecapColumns.map(col => (
                            <React.Fragment key={col.key}>
                              <td className="border p-1 bg-blue-50 dark:bg-blue-950"><input type="number" step="1" value={item.recapCosts[col.key]?.cost || ''} onChange={e => updateRecapCost(item.id, col.key, 'cost', e.target.value)} className="w-16 p-1 border rounded text-xs text-center bg-blue-50 dark:bg-blue-950 dark:border-gray-600 dark:text-gray-100" /></td>
                              <td className="border p-1 bg-blue-50 dark:bg-blue-950"><input type="number" step="1" value={item.recapCosts[col.key]?.markup || ''} onChange={e => updateRecapCost(item.id, col.key, 'markup', e.target.value)} className="w-14 p-1 border rounded text-xs text-center bg-blue-50 dark:bg-blue-950 dark:border-gray-600 dark:text-gray-100" /></td>
                            </React.Fragment>
                          ))}
                          {taxCategory && (
                            <td className="border p-2 text-right bg-amber-50 dark:bg-amber-950 font-medium text-amber-800">{fmtPrice(itemTax)}</td>
                          )}
                          <td className="border p-2 text-right font-bold bg-green-50 dark:bg-green-950">{fmtPrice(itemTotal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-200 dark:bg-gray-600 font-bold">
                      <td className="border p-2">TOTALS</td>
                      <td className="border p-2 text-center" colSpan={2}>{fmtPrice(items.reduce((s, i) => s + (i.recapCosts.installation?.total || 0), 0))}</td>
                      <td className="border p-2 text-center" colSpan={2}>{fmtPrice(items.reduce((s, i) => s + (i.recapCosts.drafting?.total || 0), 0))}</td>
                      <td className="border p-2 text-center" colSpan={2}>{fmtPrice(items.reduce((s, i) => s + (i.recapCosts.engineering?.total || 0), 0))}</td>
                      <td className="border p-2 text-center" colSpan={2}>{fmtPrice(items.reduce((s, i) => s + (i.recapCosts.projectManagement?.total || 0), 0))}</td>
                      <td className="border p-2 text-center" colSpan={2}>{fmtPrice(items.reduce((s, i) => s + (i.recapCosts.shipping?.total || 0), 0))}</td>
                      {customRecapColumns.map(col => (
                        <td key={col.key} className="border p-2 text-center bg-blue-100" colSpan={2}>{fmtPrice(items.reduce((s, i) => s + (i.recapCosts[col.key]?.total || 0), 0))}</td>
                      ))}
                      {taxCategory && (
                        <td className="border p-2 text-right bg-amber-100 text-amber-800 font-bold">{fmtPrice(items.reduce((s, i) => s + calculateItemTax(i), 0))}</td>
                      )}
                      <td className="border p-2 text-right text-green-700">{fmtPrice(totals.totalMaterialCost + totals.totalMaterialMarkup + totals.totalFabricationCost + totals.totalFabMarkup + totals.totalRecapCosts + items.reduce((s, i) => s + calculateItemTax(i), 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Recap Summary */}
              <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded border">
                <div className={`grid gap-4 ${customRecapColumns.length > 0 ? 'grid-cols-3 md:grid-cols-' + (6 + customRecapColumns.length) : 'grid-cols-2 md:grid-cols-6'}`}>
                  <div className="text-center"><p className="text-xs text-gray-600 dark:text-gray-400">Installation</p><p className="text-lg font-bold">{fmtPrice(items.reduce((s, i) => s + (i.recapCosts.installation?.total || 0), 0))}</p></div>
                  <div className="text-center"><p className="text-xs text-gray-600 dark:text-gray-400">Drafting</p><p className="text-lg font-bold">{fmtPrice(items.reduce((s, i) => s + (i.recapCosts.drafting?.total || 0), 0))}</p></div>
                  <div className="text-center"><p className="text-xs text-gray-600 dark:text-gray-400">Engineering</p><p className="text-lg font-bold">{fmtPrice(items.reduce((s, i) => s + (i.recapCosts.engineering?.total || 0), 0))}</p></div>
                  <div className="text-center"><p className="text-xs text-gray-600 dark:text-gray-400">Project Mgmt</p><p className="text-lg font-bold">{fmtPrice(items.reduce((s, i) => s + (i.recapCosts.projectManagement?.total || 0), 0))}</p></div>
                  <div className="text-center"><p className="text-xs text-gray-600 dark:text-gray-400">Shipping</p><p className="text-lg font-bold">{fmtPrice(items.reduce((s, i) => s + (i.recapCosts.shipping?.total || 0), 0))}</p></div>
                  {customRecapColumns.map(col => (
                    <div key={col.key} className="text-center bg-blue-50 dark:bg-blue-950 p-2 rounded"><p className="text-xs text-blue-700">{col.name}</p><p className="text-lg font-bold text-blue-800">{fmtPrice(items.reduce((s, i) => s + (i.recapCosts[col.key]?.total || 0), 0))}</p></div>
                  ))}
                  {taxCategory && (
                    <div className="text-center bg-amber-50 dark:bg-amber-950 p-2 rounded">
                      <p className="text-xs text-amber-700">Tax ({taxCategoryDescriptions[taxCategory].label})</p>
                      <p className="text-lg font-bold text-amber-800">{fmtPrice(items.reduce((s, i) => s + calculateItemTax(i), 0))}</p>
                    </div>
                  )}
                  <div className="text-center"><p className="text-xs text-gray-600 dark:text-gray-400">Recap Total</p><p className="text-lg font-bold text-blue-700">{fmtPrice(totals.totalRecapCosts + items.reduce((s, i) => s + calculateItemTax(i), 0))}</p></div>
                </div>
              </div>

              {taxCategory && taxCategory !== 'resale' && taxCategory !== 'noTax' && (
                <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 rounded p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-amber-900 flex items-center gap-2">
                      <Calculator size={16} />
                      Tax Calculation Details ({taxCategoryDescriptions[taxCategory].label} @ {(TAX_RATE * 100).toFixed(2)}%)
                    </h3>
                    <button
                      onClick={() => setShowTaxBreakdown(!showTaxBreakdown)}
                      className="text-sm text-amber-700 hover:text-amber-900 underline"
                      data-testid="button-toggle-tax-breakdown"
                    >
                      {showTaxBreakdown ? 'Hide Details' : 'Show Per-Item Breakdown'}
                    </button>
                  </div>

                  <div className="bg-white dark:bg-gray-900 rounded border border-amber-100 p-3 mb-3">
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">{taxCategoryDescriptions[taxCategory].description}</p>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="font-semibold text-green-800">Taxable:</p>
                        {taxCategory === 'newConstruction' && <p className="text-gray-600 dark:text-gray-400">Materials + Material Markup</p>}
                        {taxCategory === 'fob' && <p className="text-gray-600 dark:text-gray-400">Materials + Material Markup + Fabrication + Fab Markup</p>}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-500 dark:text-gray-400">Not Taxed:</p>
                        {taxCategory === 'newConstruction' && <p className="text-gray-600 dark:text-gray-400">Fabrication, Fab Markup, Installation, Drafting, Engineering, PM, Shipping</p>}
                        {taxCategory === 'fob' && <p className="text-gray-600 dark:text-gray-400">Installation, Drafting, Engineering, PM, Shipping</p>}
                      </div>
                    </div>
                  </div>

                  {showTaxBreakdown && (
                    <table className="w-full text-xs border-collapse bg-white dark:bg-gray-900 rounded" data-testid="table-tax-breakdown">
                      <thead>
                        <tr className="bg-amber-100">
                          <th className="border border-amber-200 p-2 text-left">Item</th>
                          <th className="border border-amber-200 p-2 text-right">Material Cost</th>
                          <th className="border border-amber-200 p-2 text-right">Mat Markup</th>
                          {taxCategory === 'fob' && <th className="border border-amber-200 p-2 text-right">Fab Cost</th>}
                          {taxCategory === 'fob' && <th className="border border-amber-200 p-2 text-right">Fab Markup</th>}
                          <th className="border border-amber-200 p-2 text-right font-bold">Taxable Base</th>
                          <th className="border border-amber-200 p-2 text-right font-bold">Tax ({(TAX_RATE * 100).toFixed(2)}%)</th>
                          <th className="border border-amber-200 p-2 text-right text-gray-500 dark:text-gray-400">Not Taxed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map(item => {
                          const bd = getItemTaxBreakdown(item);
                          return (
                            <tr key={item.id} className="hover:bg-amber-50 dark:hover:bg-amber-950" data-testid={`row-tax-breakdown-${item.id}`}>
                              <td className="border border-amber-200 p-2">
                                <span className="font-mono">{item.itemNumber}</span> - {item.itemName}
                              </td>
                              <td className="border border-amber-200 p-2 text-right">{fmtPrice(bd.matCost)}</td>
                              <td className="border border-amber-200 p-2 text-right">{bd.matMarkup > 0 ? fmtPrice(bd.matMarkup) : '-'}</td>
                              {taxCategory === 'fob' && <td className="border border-amber-200 p-2 text-right">{fmtPrice(bd.fabCost)}</td>}
                              {taxCategory === 'fob' && <td className="border border-amber-200 p-2 text-right">{bd.fabMarkup > 0 ? fmtPrice(bd.fabMarkup) : '-'}</td>}
                              <td className="border border-amber-200 p-2 text-right font-semibold text-green-800">{fmtPrice(bd.taxableBase)}</td>
                              <td className="border border-amber-200 p-2 text-right font-bold text-amber-800">{fmtPrice(bd.taxAmount)}</td>
                              <td className="border border-amber-200 p-2 text-right text-gray-500 dark:text-gray-400">
                                {bd.notTaxed.length > 0 ? bd.notTaxed.join(', ') : '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-amber-100 font-bold">
                          <td className="border border-amber-200 p-2">TOTALS</td>
                          <td className="border border-amber-200 p-2 text-right">{fmtPrice(items.reduce((s, i) => s + i.materials.reduce((ms, m) => ms + (m.totalCost || 0), 0), 0))}</td>
                          <td className="border border-amber-200 p-2 text-right">{fmtPrice(items.reduce((s, i) => { const mc = i.materials.reduce((ms, m) => ms + (m.totalCost || 0), 0); return s + mc * (i.materialMarkup || 0) / 100; }, 0))}</td>
                          {taxCategory === 'fob' && <td className="border border-amber-200 p-2 text-right">{fmtPrice(totals.totalFabricationCost)}</td>}
                          {taxCategory === 'fob' && <td className="border border-amber-200 p-2 text-right">{fmtPrice(totals.totalFabMarkup)}</td>}
                          <td className="border border-amber-200 p-2 text-right font-bold text-green-800">{fmtPrice(items.reduce((s, i) => s + getItemTaxBreakdown(i).taxableBase, 0))}</td>
                          <td className="border border-amber-200 p-2 text-right font-bold text-amber-800">{fmtPrice(totals.totalTax)}</td>
                          <td className="border border-amber-200 p-2 text-right text-gray-500 dark:text-gray-400">{fmtPrice(items.reduce((s, i) => { const bd = getItemTaxBreakdown(i); return s + bd.fabCost + bd.fabMarkup + bd.recapTotal; }, 0))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              )}
            </div>
          )}

          {/* SUMMARY TAB */}
          {activeTab === 'summary' && (
            <div className="space-y-4">
              <div className="bg-gray-700 dark:bg-gray-600 text-white p-4 rounded">
                <h2 className="text-xl font-bold">Estimate Summary</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2 text-sm">
                  <p><span className="text-gray-400">Project:</span> {projectName || '-'}</p>
                  <p><span className="text-gray-400">Customer:</span> {customerName || '-'}</p>
                  <p><span className="text-gray-400">Estimator:</span> {estimatedBy || '-'}</p>
                </div>
                <div className="mt-2 text-sm">
                  <span className="text-gray-400">Type: </span>
                  {[
                    projectTypes.structural && 'Structural',
                    projectTypes.miscellaneous && 'Miscellaneous',
                    projectTypes.ornamental && 'Ornamental',
                    ...customProjectTypes,
                  ].filter(Boolean).join(', ') || '-'}
                </div>
                <div className="mt-1 text-sm">
                  <span className="text-gray-400">Delivery: </span>
                  {[
                    deliveryOptions.installed && 'Installed',
                    deliveryOptions.fobJobsite && 'F.O.B. Jobsite',
                    deliveryOptions.willCall && 'Will Call',
                    selectedCustomDelivery,
                  ].filter(Boolean).join(', ') || '-'}
                </div>
                <div className="mt-1 text-sm">
                  <span className="text-gray-400">Tax Category: </span>
                  {taxCategory ? (
                    <span className="font-medium">{taxCategoryDescriptions[taxCategory].label} ({(TAX_RATE * 100).toFixed(2)}%)</span>
                  ) : '-'}
                </div>
              </div>

              {/* Item Summary */}
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-200 dark:bg-gray-600">
                    <th className="border p-2 text-left">Item</th>
                    <th className="border p-2 text-left">Breakout</th>
                    <th className="border p-2 text-right">Fab Wt</th>
                    <th className="border p-2 text-right">Material</th>
                    <th className="border p-2 text-right">Fabrication</th>
                    <th className="border p-2 text-right">Recap</th>
                    <th className="border p-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const matCost = item.materials.reduce((s, m) => s + (m.totalCost || 0), 0);
                    const matFabCost = item.materials.reduce((s, m) => s + ((m.fabrication || []).reduce((fs, f) => fs + (f.totalCost || 0), 0)), 0);
                    const itemFabCost = item.fabrication.reduce((s, f) => s + (f.totalCost || 0), 0);
                    const fabCost = matFabCost + itemFabCost;
                    const fabWt = item.materials.reduce((s, m) => s + (m.fabWeight || 0), 0);
                    const recapCost = Object.values(item.recapCosts).reduce((s, c) => s + (c.total || 0), 0);
                    const group = breakoutGroups.find(g => g.id === item.breakoutGroupId);
                    return (
                      <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="border p-2"><span className="font-mono text-xs">{item.itemNumber}</span> - {item.itemName}</td>
                        <td className="border p-1">
                          <select
                            value={item.breakoutGroupId || ''}
                            onChange={e => updateItem(item.id, 'breakoutGroupId', e.target.value ? parseInt(e.target.value) : null)}
                            className="w-full p-1 border rounded text-xs dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                          >
                            <option value="">Base Bid</option>
                            {breakoutGroups.map(g => (
                              <option key={g.id} value={g.id}>
                                {g.name || 'Unnamed'} ({g.type === 'add' ? 'ADD' : g.type === 'deduct' ? 'DED' : 'BASE'})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="border p-2 text-right">{fmtWt(fabWt)} lbs</td>
                        <td className="border p-2 text-right">{fmtPrice(matCost)}</td>
                        <td className="border p-2 text-right">{fmtPrice(fabCost)}</td>
                        <td className="border p-2 text-right">{fmtPrice(recapCost)}</td>
                        <td className="border p-2 text-right font-bold">{fmtPrice(matCost + fabCost + recapCost)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Breakout Groups Management */}
              <div className="bg-yellow-50 dark:bg-yellow-950 p-4 rounded border border-yellow-200">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-semibold text-yellow-800">Breakout Groups (Alternates)</h3>
                  <button
                    onClick={addBreakoutGroup}
                    className="flex items-center gap-1 bg-yellow-600 text-white px-3 py-1 rounded text-sm hover:bg-yellow-700"
                  >
                    <Plus size={14} /> Add Group
                  </button>
                </div>
                
                {breakoutGroups.length === 0 ? (
                  <p className="text-sm text-yellow-700">No breakout groups defined. All items are included in the base bid.</p>
                ) : (
                  <div className="space-y-2">
                    {breakoutGroups.map(group => {
                      const groupItems = items.filter(i => i.breakoutGroupId === group.id);
                      const groupTotal = groupItems.reduce((s, i) => s + getItemTotal(i), 0);
                      return (
                        <div key={group.id} className="flex items-center gap-2 bg-white dark:bg-gray-900 p-2 rounded border">
                          <input
                            type="text"
                            placeholder="Group Name (e.g., Canopy, Stair #1)"
                            value={group.name}
                            onChange={e => updateBreakoutGroup(group.id, 'name', e.target.value)}
                            className="flex-1 p-1 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                          />
                          <select
                            value={group.type}
                            onChange={e => updateBreakoutGroup(group.id, 'type', e.target.value)}
                            className="p-1 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                          >
                            <option value="base">Base</option>
                            <option value="deduct">Deduct</option>
                            <option value="add">Add</option>
                          </select>
                          <span className="text-sm font-mono w-24 text-right">
                            {fmtPrice(groupTotal)}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400 w-16">
                            ({groupItems.length} items)
                          </span>
                          <button
                            onClick={() => deleteBreakoutGroup(group.id)}
                            className="text-red-600 hover:text-red-800 p-1"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {breakoutGroups.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-yellow-300 text-sm">
                    <p className="text-yellow-800 font-medium">Quote Preview:</p>
                    {(() => {
                      const breakouts = breakoutTotals;
                      return (
                        <div className="mt-2 space-y-1">
                          <p className="font-bold">Base Bid: {fmtPrice(breakouts.baseBid)}</p>
                          {breakouts.deducts.length > 0 && (
                            <div className="ml-4">
                              <p className="text-xs text-gray-600 dark:text-gray-400">DEDUCT OPTIONS:</p>
                              {breakouts.deducts.map(d => (
                                <p key={d.id} className="text-red-700">- {d.name || 'Unnamed'}: -{fmtPrice(d.total)}</p>
                              ))}
                            </div>
                          )}
                          {breakouts.adds.length > 0 && (
                            <div className="ml-4">
                              <p className="text-xs text-gray-600 dark:text-gray-400">ADD OPTIONS:</p>
                              {breakouts.adds.map(a => (
                                <p key={a.id} className="text-green-700">+ {a.name || 'Unnamed'}: +{fmtPrice(a.total)}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* General Adjustments */}
              <div className="bg-yellow-50 dark:bg-yellow-950 p-4 rounded border border-yellow-200">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-semibold text-yellow-800">General Adjustments (Internal Only)</h3>
                  <button
                    onClick={addAdjustment}
                    className="flex items-center gap-1 bg-yellow-600 text-white px-3 py-1 rounded text-sm hover:bg-yellow-700"
                  >
                    <Plus size={14} /> Add Adjustment
                  </button>
                </div>
                
                {adjustments.length === 0 ? (
                  <p className="text-sm text-yellow-700">No adjustments. Use for rounding, contingency, GC discounts, etc.</p>
                ) : (
                  <div className="space-y-2">
                    {adjustments.map(adj => (
                      <div key={adj.id} className="flex items-center gap-2 bg-white dark:bg-gray-900 p-2 rounded border">
                        <span className="text-sm text-gray-600 dark:text-gray-400">$</span>
                        <input
                          type="number"
                          step="1"
                          placeholder="+/- Amount"
                          value={adj.amount || ''}
                          onChange={e => updateAdjustment(adj.id, 'amount', e.target.value)}
                          className="w-28 p-1 border rounded text-sm text-right dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                        />
                        <input
                          type="text"
                          placeholder="Note (e.g., Rounding, Contingency, GC Discount)"
                          value={adj.note}
                          onChange={e => updateAdjustment(adj.id, 'note', e.target.value)}
                          className="flex-1 p-1 border rounded text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
                        />
                        <button
                          onClick={() => deleteAdjustment(adj.id)}
                          className="text-red-600 hover:text-red-800 p-1"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    <div className="text-right text-sm font-semibold pt-2 border-t">
                      Total Adjustments: <span className={totals.totalAdjustments >= 0 ? 'text-green-700' : 'text-red-700'}>{fmtPrice(totals.totalAdjustments)}</span>
                    </div>
                  </div>
                )}
                <p className="text-xs text-yellow-600 mt-2">* Adjustments are baked into the final total but NOT shown separately on the quote.</p>
              </div>

              {/* Grand Totals */}
              <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded border">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm">Fab Weight: <span className="font-bold text-blue-700">{fmtWt(totals.totalFabWeight)} lbs</span></p>
                    <p className="text-sm">Stock Weight: <span className="font-bold">{fmtWt(totals.totalStockWeight)} lbs</span></p>
                    <p className="text-sm">Waste: <span className="font-bold text-orange-600">{fmtWt(totals.totalStockWeight - totals.totalFabWeight)} lbs</span></p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm">Materials: {fmtPrice(totals.totalMaterialCost)}</p>
                    <p className="text-sm">Fabrication: {fmtPrice(totals.totalFabricationCost)}</p>
                    <p className="text-sm">Recap Costs: {fmtPrice(totals.totalRecapCosts)}</p>
                    {totals.totalTax > 0 && (
                      <p className="text-sm">Tax ({taxCategoryDescriptions[taxCategory]?.label}): <span className="text-amber-700">{fmtPrice(totals.totalTax)}</span></p>
                    )}
                    {totals.totalAdjustments !== 0 && (
                      <p className="text-sm">Adjustments: <span className={totals.totalAdjustments >= 0 ? 'text-green-700' : 'text-red-700'}>{fmtPrice(totals.totalAdjustments)}</span></p>
                    )}
                    <p className="text-xl font-bold mt-2 text-green-700">TOTAL: {fmtPrice(totals.grandTotal)}</p>
                  </div>
                </div>
              </div>

              {/* Exclusions & Qualifications */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-red-50 dark:bg-red-950 p-4 rounded border border-red-200">
                  <h3 className="font-semibold text-red-800 mb-2">Exclusions</h3>
                  <ul className="text-sm space-y-1">
                    {[...selectedExclusions, ...customExclusions].map((exc, i) => (
                      <li key={i} className="text-red-700">- {exc}</li>
                    ))}
                  </ul>
                </div>
                <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded border border-blue-200">
                  <h3 className="font-semibold text-blue-800 mb-2">Qualifications</h3>
                  <ul className="text-sm space-y-1">
                    {[...selectedQualifications, ...customQualifications].map((qual, i) => (
                      <li key={i} className="text-blue-700">- {qual}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* QUOTE TAB */}
          {activeTab === 'quote' && (
            <div className="bg-white dark:bg-gray-900 max-w-4xl mx-auto" style={{ minHeight: '11in', padding: '0.5in' }}>
              {/* Print styles */}
              <style>{`
                @media print {
                  body * { visibility: hidden; }
                  .quote-printable, .quote-printable * { visibility: visible; }
                  .quote-printable { position: absolute; left: 0; top: 0; width: 8.5in; }
                  .no-print { display: none !important; }
                }
              `}</style>
              
              <div className="quote-printable">
                {/* Company Header */}
                <div className="border-b-2 border-gray-800 pb-4 mb-4">
                  <img src={COMPANY_LOGO} alt="Company Logo" style={{ height: '60px' }} />
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 text-center mt-2">QUOTATION</h1>
                </div>

                {/* Legal Terms Block */}
                <div className="mb-4 text-gray-700 dark:text-gray-300 leading-relaxed" style={{ fontSize: '9px' }}>
                  <p className="mb-1">
                    We propose to furnish the following described materials for the above structure, in accordance with the conditions of the Code of Standard Practice of American Institute of Steel Construction and the following terms and conditions, which upon acceptance by you of this proposal, are agreed to and accepted by you.
                  </p>
                  {(!taxCategory || taxCategory === 'resale' || taxCategory === 'noTax') && (
                    <p className="mb-1">
                      <span className="font-semibold">NOTE:</span> The prices quoted in the proposal DO NOT INCLUDE TAX OF ANY NATURE, "STATE, FEDERAL, LOCAL OR USE."
                    </p>
                  )}
                  <p>
                    <span className="font-semibold">Acceptance & Approval of Contract:</span> This proposal is made for acceptance by you in writing within 30 days from this date, and shall become a contract only upon approval thereafter by our Contracting Manager, or other authorized personnel.
                  </p>
                </div>

                {/* Project Information */}
                <div className="mb-6 border-t border-gray-300 dark:border-gray-600 pt-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p>{customerName || '_______________'}</p>
                      <p>{billingAddress || '_______________'}</p>
                      <p>{customerContact || '_______________'}</p>
                      <p>{customerEmail || '_______________'}</p>
                    </div>
                    <div className="text-right">
                      <p>{new Date().toLocaleDateString()}</p>
                      <p><span className="font-semibold">JOB:</span> {projectName || '_______________'}</p>
                      <p><span className="font-semibold">LOCATION:</span> {projectAddress || '_______________'}</p>
                      <p><span className="font-semibold">ARCHITECT:</span> {architect || '_______________'}</p>
                      <p><span className="font-semibold">DRAWING SET:</span> {drawingRevision || '_______________'}{drawingDate ? `, ${new Date(drawingDate).toLocaleDateString()}` : ''}</p>
                    </div>
                  </div>
                </div>

                {/* Greeting */}
                <div className="mb-4 text-sm">
                  <p>Valued Customer,</p>
                  <p className="mt-2">We are pleased to quote you on the following {[
                    projectTypes.structural && 'structural',
                    projectTypes.miscellaneous && 'miscellaneous',
                    projectTypes.ornamental && 'ornamental',
                    ...customProjectTypes.map(t => t.toLowerCase()),
                  ].filter(Boolean).join(', ').replace(/, ([^,]*)$/, ' and $1') || '_______________'} metal items in accordance with the drawings dated {drawingDate ? new Date(drawingDate).toLocaleDateString() : '_______________'}:</p>
                </div>

                {/* Item List */}
                <div className="mb-6">
                  {(() => {
                    const breakouts = breakoutTotals;
                    const baseItems = items.filter(item => {
                      const group = breakoutGroups.find(g => g.id === item.breakoutGroupId);
                      return !group || group.type === 'base' || group.type === 'deduct';
                    });
                    const addItems = items.filter(item => {
                      const group = breakoutGroups.find(g => g.id === item.breakoutGroupId);
                      return group && group.type === 'add';
                    });
                    
                    return (
                      <>
                        <table className="w-full text-sm border-collapse">
                          <thead>
                            <tr className="border-b-2 border-gray-800">
                              <th className="text-left p-2 font-semibold">Item #</th>
                              <th className="text-left p-2 font-semibold">Description</th>
                              <th className="text-left p-2 font-semibold">Drawing Reference</th>
                            </tr>
                          </thead>
                          <tbody>
                            {baseItems.map(item => (
                              <tr key={item.id} className="border-b border-gray-300 dark:border-gray-600">
                                <td className="p-2 font-mono">{item.itemNumber}</td>
                                <td className="p-2">{item.itemName}</td>
                                <td className="p-2">{item.drawingRef || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        
                        {addItems.length > 0 && (
                          <div className="mt-4">
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Additional items available (see Add Options below):</p>
                            <table className="w-full text-sm border-collapse">
                              <tbody>
                                {addItems.map(item => (
                                  <tr key={item.id} className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                                    <td className="p-1 font-mono text-xs">{item.itemNumber}</td>
                                    <td className="p-1 text-xs">{item.itemName}</td>
                                    <td className="p-1 text-xs">{item.drawingRef || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* Total Statement with Breakouts */}
                {(() => {
                  const breakouts = breakoutTotals;
                  const hasBreakouts = breakouts.deducts.length > 0 || breakouts.adds.length > 0;
                  const deliveryText = [
                    deliveryOptions.installed && 'INSTALLED',
                    deliveryOptions.fobJobsite && 'F.O.B. JOBSITE',
                    deliveryOptions.willCall && 'WILL CALL',
                    selectedCustomDelivery && selectedCustomDelivery.toUpperCase(),
                  ].filter(Boolean).join(', ') || '_______________';
                  
                  return (
                    <>
                      <div className="mb-4 p-4 bg-gray-100 dark:bg-gray-700 border-2 border-gray-800 text-center">
                        <p className="text-lg">
                          <span className="font-semibold">{hasBreakouts ? 'BASE BID' : 'ALL FOR THE SUM OF'}</span>
                          <span> ..........</span>
                          <span className="font-semibold">{deliveryText}</span>
                          <span>.............. </span>
                          <span className="inline-block text-right" style={{ minWidth: '0' }}>
                            <span className="text-xl font-bold" style={{ borderBottom: '2px solid #111827', paddingBottom: '1px', letterSpacing: '0.025em' }}>{fmtQuotePrice(breakouts.baseBid)}</span>
                          </span>
                          {taxCategory && taxCategory !== 'resale' && taxCategory !== 'noTax' && totals.totalTax > 0 && (
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 ml-2 tracking-wide">TAX INCLUDED</span>
                          )}
                        </p>
                      </div>
                      
                      {breakouts.deducts.length > 0 && (
                        <div className="mb-4 p-3 border border-red-300 bg-red-50 dark:bg-red-950">
                          <p className="font-semibold text-sm mb-2 text-red-800">DEDUCT OPTIONS:</p>
                          {breakouts.deducts.map(d => (
                            <p key={d.id} className="text-sm mb-1 flex justify-between">
                              <span>If {d.name || 'this scope'} is removed from Berger Iron's scope, please deduct from the base bid.</span>
                              <span className="font-bold ml-2">{fmtQuotePrice(d.total)}</span>
                            </p>
                          ))}
                        </div>
                      )}
                      
                      {breakouts.adds.length > 0 && (
                        <div className="mb-4 p-3 border border-green-300 bg-green-50 dark:bg-green-950">
                          <p className="font-semibold text-sm mb-2 text-green-800">ADD OPTIONS:</p>
                          {breakouts.adds.map(a => (
                            <p key={a.id} className="text-sm mb-1 flex justify-between">
                              <span>If Berger Iron is to provide the additional {a.name || 'scope'}, please add to the base bid.</span>
                              <span className="font-bold ml-2">{fmtQuotePrice(a.total)}</span>
                            </p>
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* Qualifications */}
                <div className="mb-6">
                  <h3 className="font-semibold text-sm border-b border-gray-400 dark:border-gray-500 pb-1 mb-2">QUALIFICATIONS:</h3>
                  <ul className="text-xs space-y-1">
                    {[...selectedQualifications, ...customQualifications].map((qual, i) => (
                      <li key={i}>- {qual}</li>
                    ))}
                  </ul>
                </div>

                {/* Exclusions */}
                <div className="mb-8">
                  <h3 className="font-semibold text-sm border-b border-gray-400 dark:border-gray-500 pb-1 mb-2">EXCLUSIONS:</h3>
                  <ul className="text-xs space-y-1">
                    {[...selectedExclusions, ...customExclusions].map((exc, i) => (
                      <li key={i}>- {exc}</li>
                    ))}
                  </ul>
                </div>

                {/* Signature Section */}
                <div className="mt-8 pt-4 border-t border-gray-400 dark:border-gray-500">
                  <div className="grid grid-cols-2 gap-8">
                    <div>
                      <p className="text-sm mb-1">Respectfully submitted,</p>
                      <div className="mt-8 border-b border-gray-800 w-48"></div>
                      <p className="text-sm mt-1">{estimatedBy || 'Estimator'}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Date: {estimateDate ? new Date(estimateDate).toLocaleDateString() : '_______________'}</p>
                    </div>
                    <div className="flex flex-col items-end">
                      <div className="flex items-end gap-2 mb-6">
                        <span className="text-sm whitespace-nowrap">Accepted By:</span>
                        <div className="border-b border-gray-800 w-48"></div>
                      </div>
                      <div className="flex items-end gap-2 mb-6">
                        <span className="text-sm whitespace-nowrap">Authorized Signature:</span>
                        <div className="border-b border-gray-800 w-48"></div>
                      </div>
                      <div className="flex items-end gap-2">
                        <span className="text-sm whitespace-nowrap">Date:</span>
                        <div className="border-b border-gray-800 w-48"></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="mt-8 pt-4 border-t border-gray-300 dark:border-gray-600 text-center text-xs text-gray-500 dark:text-gray-400">
                  <p>All agreements contingent upon Fires, Strikes, Embargoes, or all other causes beyond our control.</p>
                </div>
              </div>

              {/* Print Button */}
              <div className="no-print mt-6 text-center">
                <button 
                  onClick={() => window.print()}
                  className="bg-gray-700 dark:bg-gray-600 text-white px-6 py-2 rounded hover:bg-gray-800"
                >
                  Print Quote
                </button>
              </div>
            </div>
          )}

      {/* Import Preview Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto m-4">
            <div className="bg-green-700 text-white p-4 rounded-t-lg flex justify-between items-center">
              <h3 className="text-lg font-bold">Import from Revu CSV</h3>
              <button onClick={cancelImport} className="text-white hover:text-gray-300 text-2xl">&times;</button>
            </div>
            
            <div className="p-6 space-y-4">
              {importError && (
                <div className="bg-red-50 dark:bg-red-950 border border-red-200 rounded p-4 flex items-start gap-3">
                  <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                  <div>
                    <p className="font-semibold text-red-800">Import Error</p>
                    <p className="text-red-700 text-sm">{importError}</p>
                  </div>
                </div>
              )}
              
              {importPreview && (
                <>
                  <div className="bg-green-50 dark:bg-green-950 border border-green-200 rounded p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Check className="text-green-600" size={20} />
                      <span className="font-semibold text-green-800">Ready to Import</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div><span className="text-gray-600 dark:text-gray-400">Items:</span> <span className="font-semibold">{importPreview.items.length}</span></div>
                      <div><span className="text-gray-600 dark:text-gray-400">Material Lines:</span> <span className="font-semibold">{importPreview.items.reduce((sum, item) => sum + item.materials.length, 0)}</span></div>
                      <div><span className="text-gray-600 dark:text-gray-400">Total Pieces:</span> <span className="font-semibold">{importPreview.items.reduce((sum, item) => sum + item.materials.reduce((msum, mat) => msum + mat.pieces, 0), 0)}</span></div>
                    </div>
                  </div>

                  {importPreview.unmatchedSizes.length > 0 && (
                    <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 rounded p-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="text-yellow-600 flex-shrink-0 mt-0.5" size={20} />
                        <div>
                          <p className="font-semibold text-yellow-800">Unmatched Sizes</p>
                          <p className="text-yellow-700 text-sm mb-2">The following sizes could not be matched to the AISC database and will be imported as Custom:</p>
                          <div className="flex flex-wrap gap-2">
                            {importPreview.unmatchedSizes.map((size, i) => (
                              <span key={i} className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs">{size}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="border rounded overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 dark:bg-gray-700">
                        <tr>
                          <th className="p-2 text-left">Item #</th>
                          <th className="p-2 text-left">Description</th>
                          <th className="p-2 text-left">Drawing Ref</th>
                          <th className="p-2 text-right">Materials</th>
                          <th className="p-2 text-right">Total Pcs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.items.slice(0, 10).map((item, i) => (
                          <tr key={i} className="border-t hover:bg-gray-50 dark:hover:bg-gray-800">
                            <td className="p-2 font-mono">{item.itemNumber}</td>
                            <td className="p-2">{item.itemName}</td>
                            <td className="p-2 text-gray-600 dark:text-gray-400">{item.drawingRef || '-'}</td>
                            <td className="p-2 text-right">{item.materials.length}</td>
                            <td className="p-2 text-right font-semibold">{item.materials.reduce((sum, mat) => sum + mat.pieces, 0)}</td>
                          </tr>
                        ))}
                        {importPreview.items.length > 10 && (
                          <tr className="border-t bg-gray-50 dark:bg-gray-800">
                            <td colSpan={5} className="p-2 text-center text-gray-600 dark:text-gray-400">... and {importPreview.items.length - 10} more items</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 rounded p-4 text-sm">
                    <p className="font-semibold text-blue-800 mb-1">Merge Behavior:</p>
                    <ul className="text-blue-700 space-y-1">
                      <li>- Matching material lines: Quantity will be replaced</li>
                      <li>- New material lines: Will be added to existing items</li>
                      <li>- New items: Will be created</li>
                      <li>- Existing fabrication and pricing: Will be preserved</li>
                      <li>- Drawing references: Will be appended</li>
                    </ul>
                  </div>
                </>
              )}
            </div>

            <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-b-lg flex justify-end gap-2">
              <button onClick={cancelImport} className="px-4 py-2 border rounded hover:bg-gray-200">Cancel</button>
              {importPreview && (
                <button onClick={executeImport} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
                  Import {importPreview.items.length} Items
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Takeoff Import Modal (Neilsoft 19-column) */}
      {showTakeoffModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto m-4">
            <div className="bg-blue-700 text-white p-4 rounded-t-lg flex justify-between items-center">
              <h3 className="text-lg font-bold">Import Takeoff CSV</h3>
              <button onClick={cancelTakeoffImport} className="text-white hover:text-gray-300 text-2xl">&times;</button>
            </div>

            <div className="p-6 space-y-4">
              {takeoffError && (
                <div className="bg-red-50 dark:bg-red-950 border border-red-200 rounded p-4 flex items-start gap-3">
                  <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                  <div>
                    <p className="font-semibold text-red-800">Import Error</p>
                    <p className="text-red-700 text-sm">{takeoffError}</p>
                  </div>
                </div>
              )}

              {takeoffPreview && (
                <>
                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 rounded p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Check className="text-blue-600" size={20} />
                      <span className="font-semibold text-blue-800">Ready to Import</span>
                    </div>
                    <div className="flex gap-8 text-sm">
                      <div><span className="text-gray-600 dark:text-gray-400">Items:</span> <span className="font-bold text-blue-800">{takeoffPreview.stats.totalItems}</span></div>
                      <div><span className="text-gray-600 dark:text-gray-400">Members:</span> <span className="font-bold text-blue-800">{takeoffPreview.stats.totalMembers}</span></div>
                      <div><span className="text-gray-600 dark:text-gray-400">Fab Operations:</span> <span className="font-bold text-blue-800">{takeoffPreview.stats.totalFabOps}</span></div>
                    </div>
                  </div>

                  {takeoffPreview.items.some(i => i.coatingMixed) && (
                    <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-300 rounded p-4 text-sm">
                      <p className="font-semibold text-yellow-800 mb-1">Mixed Coating Warning</p>
                      <p className="text-yellow-700 mb-2">The following items have rows with different or missing coating values. No item-level coating operation will be added — review manually:</p>
                      <ul className="list-disc list-inside text-yellow-700 space-y-0.5">
                        {takeoffPreview.items.filter(i => i.coatingMixed).map(i => (
                          <li key={i.itemNumber}>
                            Item {i.itemNumber} — {i.itemName}
                            {i.coatingMixedValues.length > 0 && (
                              <span className="text-yellow-600"> ({i.coatingMixedValues.join(', ')})</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-gray-100 dark:bg-gray-700">
                          <th className="border p-2 text-left">Item #</th>
                          <th className="border p-2 text-left">Description</th>
                          <th className="border p-2 text-left">Drawing Ref</th>
                          <th className="border p-2 text-center">Members</th>
                          <th className="border p-2 text-center">Fab Ops</th>
                          <th className="border p-2 text-left">Coating</th>
                        </tr>
                      </thead>
                      <tbody>
                        {takeoffPreview.items.slice(0, 10).map(item => {
                          const memberCount = item.members.reduce((n, m) => n + 1 + (m.children || []).length, 0);
                          const fabOpCount = item.members.reduce((n, m) =>
                            n + (m.fabrication || []).length +
                            (m.children || []).reduce((nc, c) => nc + (c.fabrication || []).length, 0), 0
                          );
                          return (
                            <tr key={item.itemNumber} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                              <td className="border p-2 font-mono">{item.itemNumber}</td>
                              <td className="border p-2">{item.itemName}</td>
                              <td className="border p-2 text-gray-600 dark:text-gray-400">{item.drawingRef}</td>
                              <td className="border p-2 text-center">{memberCount}</td>
                              <td className="border p-2 text-center">{fabOpCount}</td>
                              <td className="border p-2 text-sm">
                                {item.coatingUniform
                                  ? <span className="text-green-700">{item.coatingUniform}</span>
                                  : item.coatingMixed
                                    ? <span className="text-yellow-600">Mixed</span>
                                    : <span className="text-gray-400">—</span>
                                }
                              </td>
                            </tr>
                          );
                        })}
                        {takeoffPreview.items.length > 10 && (
                          <tr>
                            <td colSpan={6} className="p-2 text-center text-gray-500 dark:text-gray-400">
                              ... and {takeoffPreview.items.length - 10} more items
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 rounded p-4 text-sm">
                    <p className="font-semibold text-blue-800 mb-1">Import Behavior:</p>
                    <ul className="text-blue-700 space-y-1">
                      <li>- Each member mark becomes a material line (parents + children)</li>
                      <li>- Fabrication operations are populated per member</li>
                      <li>- Uniform coating becomes an item-level fabrication operation</li>
                      <li>- Mixed coatings are skipped — add manually after import</li>
                      <li>- Existing items: new materials appended, no duplicates added</li>
                      <li>- Existing pricing and fabrication rates are preserved</li>
                    </ul>
                  </div>
                </>
              )}
            </div>

            <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-b-lg flex justify-end gap-2">
              <button onClick={cancelTakeoffImport} className="px-4 py-2 border rounded hover:bg-gray-200">Cancel</button>
              {takeoffPreview && (
                <button onClick={executeTakeoffImport} className="px-4 py-2 bg-blue-700 text-white rounded hover:bg-blue-800">
                  Import {takeoffPreview.stats.totalItems} Items
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-[100] cursor-zoom-out"
          onClick={() => setLightboxSrc(null)}
        >
          <img
            src={lightboxSrc}
            alt="Snapshot"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-6 text-white text-3xl font-bold hover:text-gray-300"
            onClick={() => setLightboxSrc(null)}
          >×</button>
        </div>
      )}

        </div>
      </div>
    </div>
  );
};

export default SteelEstimator;
