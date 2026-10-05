// components/home/achievers.js  (new file)
//
// Student achievements shown in the "Student Results" section of the homepage.
// Data was taken from the result posters. To add / fix a student, edit here only.
//
// photo: file name (without extension) inside /public/images/students_images/, using the
//        existing convention "firstname lastname" in lowercase, saved as .jpeg
//        e.g. "yash thete"  ->  /images/students_images/yash thete.jpeg
//        If the file is missing, the card shows the student's initials instead.
// badges: r = rank (1, 2, 3 get gold / silver / bronze styling; anything else is neutral)

export const PHOTO_DIR = '/images/students_images/';

export const RESULT_STATS = [
  { v: '99/100', l: 'Highest HSC Chemistry marks' },
  { v: '2nd', l: 'Rank in Pune Board (HSC)' },
  { v: '98.71%', l: 'Top JEE Chemistry score' },
  { v: 'AIR 5488', l: 'VITEEE All India Rank' },
];

// JEE & entrance exams
export const JEE_ACHIEVERS = [
  { name: 'Om Pawar', photo: 'om pawar', score: '98.71%', label: 'JEE Chemistry',
    badges: [{ t: '1st in Sangamner Taluka', r: 1 }, { t: 'Overall 99.34%' }, { t: 'All India Rank 10583' }, { t: 'OBC Rank 2565' }] },
  { name: 'Vaishnavi Varpe', photo: 'vaishnavi varpe', score: '97.71%', label: 'JEE Chemistry',
    badges: [{ t: '2nd in Sangamner Taluka', r: 2 }] },
  { name: 'Shreya Kohle', photo: 'shreya kohle', score: '92.38%', label: 'JEE Chemistry',
    badges: [{ t: '3rd in Sangamner Taluka', r: 3 }] },
  { name: 'Soham Musale', photo: 'soham musale', score: '86.64', outOf: '/100', label: 'JEE Chemistry',
    badges: [{ t: '12th Board: 80/100' }] },
  { name: 'Harshwardhan Raut', photo: 'harshwardhan raut', score: 'AIR 5488', label: 'VITEEE',
    badges: [{ t: 'All India Rank 5488' }] },
];

// HSC board exam: marks in Chemistry
export const HSC_CHEMISTRY = [
  { name: 'Yash Thete', photo: 'yash thete', score: '99', outOf: '/100', label: 'HSC Chemistry', tag: 'HSC 2026',
    badges: [{ t: '2nd Rank, Pune Board', r: 2 }, { t: '1st Rank, Sangamner Taluka', r: 1 }, { t: '1st Rank, Shramik College', r: 1 }] },
  { name: 'Shreya Kohle', photo: 'shreya kohle', score: '96', outOf: '/100', label: 'HSC Chemistry',
    badges: [{ t: '1st Rank, Ohara College', r: 1 }] },
  { name: 'Ishwari Phatangare', photo: 'ishwari phatangare', score: '96', outOf: '/100', label: 'HSC Chemistry',
    badges: [{ t: '2nd Rank, Shramik College', r: 2 }] },
  { name: 'Sanchit Musale', photo: 'sanchit musale', score: '93', outOf: '/100', label: 'HSC Chemistry',
    badges: [{ t: '1st Rank, Vidyanekatan College, Bota', r: 1 }] },
  { name: 'Shraddha Fulsundar', photo: 'shraddha fulsundar', score: '92', outOf: '/100', label: 'HSC Chemistry',
    badges: [{ t: '3rd Rank, Ohara College', r: 3 }] },
  { name: 'Aakansha Aher', photo: 'aakansha aher', score: '92', outOf: '/100', label: 'HSC Chemistry',
    badges: [{ t: '4th Rank, Shramik College', r: 4 }] },
  { name: 'Meet Muttha', photo: 'meet muttha', score: '92', outOf: '/100', label: 'HSC Chemistry', badges: [] },
  { name: 'Aryan Kotkar', photo: 'aryan kotkar', score: '90', outOf: '/100', label: 'HSC Chemistry',
    badges: [{ t: '4th Rank, Shramik College', r: 4 }] },
];

// HSC board exam: overall board marks
export const HSC_OVERALL = [
  { name: 'Harshwardhan Raut', photo: 'harshwardhan raut', score: '87', label: 'HSC marks', tag: 'HSC 2025',
    badges: [{ t: '3rd Rank, Sahyadri College', r: 3 }] },
  { name: 'Asmita Nawde', photo: 'asmita nawde', score: '87', outOf: '/100', label: '12th Board marks', badges: [] },
  { name: 'Samiksha Ghodekar', photo: 'samiksha ghodekar', score: '85', outOf: '/100', label: '12th Board marks', badges: [] },
  { name: 'Sarthak Chavanke', photo: 'sarthak chavanke', score: '85', outOf: '/100', label: '12th Board marks', badges: [] },
  { name: 'Soham Musale', photo: 'soham musale', score: '80', outOf: '/100', label: '12th Board marks', badges: [] },
  { name: 'Savli Satpute', photo: 'savli satpute', score: '80', label: 'HSC marks', badges: [] },
  { name: 'Upasana Tarte', photo: 'upasana tarte', score: '80', outOf: '/100', label: '12th Board marks', badges: [] },
];
