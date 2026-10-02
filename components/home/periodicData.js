/* Data + derived properties for all 118 elements.
   Raw row: Z|Symbol|Name|Mass|Melt(K)|Boil(K)|Density|Electronegativity|Discovery|Fact */
const RAW = [
'1|H|Hydrogen|1.008|13.99|20.27|0.0899|2.20|Henry Cavendish, 1766|Lightest and most abundant element in the universe; powers stars and fuel cells.',
'2|He|Helium|4.0026|0.95|4.22|0.1786||Janssen & Lockyer, 1868|Used in balloons and to cool MRI magnets; first discovered on the Sun.',
'3|Li|Lithium|6.94|453.65|1603|0.534|0.98|Johan Arfwedson, 1817|Lightest metal; heart of rechargeable lithium-ion batteries.',
'4|Be|Beryllium|9.0122|1560|2742|1.85|1.57|Louis Vauquelin, 1798|Light, stiff metal used in aerospace alloys and X-ray windows.',
'5|B|Boron|10.81|2349|4200|2.34|2.04|Gay-Lussac & Thénard, 1808|Used in borosilicate (Pyrex) glass, borax and detergents.',
'6|C|Carbon|12.011|3823|4098|2.267|2.55|Known since antiquity|Basis of all organic chemistry; occurs as diamond, graphite and fullerenes.',
'7|N|Nitrogen|14.007|63.15|77.36|1.2506|3.04|Daniel Rutherford, 1772|Makes up 78% of air; essential for fertilisers (Haber process) and proteins.',
'8|O|Oxygen|15.999|54.36|90.20|1.429|3.44|Scheele & Priestley, 1774|Needed for respiration and combustion; 21% of the atmosphere.',
'9|F|Fluorine|18.998|53.48|85.03|1.696|3.98|Henri Moissan, 1886|Most electronegative element; used in toothpaste and Teflon.',
'10|Ne|Neon|20.180|24.56|27.07|0.9002||Ramsay & Travers, 1898|Glows red-orange in discharge tubes: the classic neon sign.',
'11|Na|Sodium|22.990|370.87|1156|0.971|0.93|Humphry Davy, 1807|Soft metal that reacts violently with water; part of table salt (NaCl).',
'12|Mg|Magnesium|24.305|923|1363|1.738|1.31|Joseph Black, 1755|Burns with a brilliant white flame; central atom in chlorophyll.',
'13|Al|Aluminium|26.982|933.47|2792|2.70|1.61|Hans Ørsted, 1825|Light, corrosion-resistant metal for cans, foil and aircraft.',
'14|Si|Silicon|28.085|1687|3538|2.329|1.90|Jöns Berzelius, 1824|The semiconductor behind computer chips; main component of sand and glass.',
'15|P|Phosphorus|30.974|317.3|550|1.82|2.19|Hennig Brand, 1669|Found in DNA, ATP and fertilisers; white phosphorus glows in the dark.',
'16|S|Sulfur|32.06|388.36|717.8|2.067|2.58|Known since antiquity|Used to make sulfuric acid, the most produced industrial chemical.',
'17|Cl|Chlorine|35.45|171.6|239.11|3.214|3.16|Carl Scheele, 1774|Disinfects drinking water and makes PVC plastic.',
'18|Ar|Argon|39.948|83.8|87.3|1.784||Rayleigh & Ramsay, 1894|Third most abundant gas in air; used as inert shield gas in welding.',
'19|K|Potassium|39.098|336.53|1032|0.862|0.82|Humphry Davy, 1807|Reacts with water producing a lilac flame; vital for nerves and plant growth.',
'20|Ca|Calcium|40.078|1115|1757|1.55|1.00|Humphry Davy, 1808|Builds bones, teeth, limestone and cement.',
'21|Sc|Scandium|44.956|1814|3109|2.985|1.36|Lars Nilson, 1879|Strengthens aluminium alloys for aircraft and sports gear.',
'22|Ti|Titanium|47.867|1941|3560|4.506|1.54|William Gregor, 1791|Strong, light and biocompatible; used in implants; TiO₂ is white pigment.',
'23|V|Vanadium|50.942|2183|3680|6.11|1.63|Andrés del Río, 1801|Alloy steel additive; V₂O₅ is the catalyst in the Contact process.',
'24|Cr|Chromium|51.996|2180|2944|7.15|1.66|Louis Vauquelin, 1797|Gives stainless steel and chrome plating their shine; has an exceptional configuration.',
'25|Mn|Manganese|54.938|1519|2334|7.21|1.55|Johan Gahn, 1774|Hardens steel; KMnO₄ is a classic oxidising agent with several oxidation states.',
'26|Fe|Iron|55.845|1811|3134|7.874|1.83|Known since antiquity|Backbone of steel; carries oxygen in haemoglobin.',
'27|Co|Cobalt|58.933|1768|3200|8.90|1.88|Georg Brandt, 1735|Gives blue glass its colour; used in magnets and battery cathodes; centre of vitamin B12.',
'28|Ni|Nickel|58.693|1728|3186|8.908|1.91|Axel Cronstedt, 1751|Coins, stainless steel and the catalyst for hydrogenation of oils.',
'29|Cu|Copper|63.546|1357.77|2835|8.96|1.90|Known since antiquity|Excellent conductor of electricity; used in wires; has an exceptional configuration.',
'30|Zn|Zinc|65.38|692.68|1180|7.14|1.65|Andreas Marggraf, 1746|Galvanises iron against rusting and forms brass with copper.',
'31|Ga|Gallium|69.723|302.91|2673|5.91|1.81|Lecoq de Boisbaudran, 1875|Melts in your hand (about 30 °C); used in LEDs and chips.',
'32|Ge|Germanium|72.630|1211.4|3106|5.323|2.01|Clemens Winkler, 1886|Mendeleev predicted it as eka-silicon; used in fibre optics and semiconductors.',
'33|As|Arsenic|74.922|1090|887|5.727|2.18|Albertus Magnus, c. 1250|A famous poison; gallium arsenide is used in semiconductors.',
'34|Se|Selenium|78.971|494|958|4.81|2.55|Jöns Berzelius, 1817|Light-sensitive; used in photocells and to decolourise glass.',
'35|Br|Bromine|79.904|265.8|332|3.12|2.96|Antoine Balard, 1826|One of only two elements that are liquid at room temperature; red-brown fumes.',
'36|Kr|Krypton|83.798|115.79|119.93|3.749|3.00|Ramsay & Travers, 1898|Used in high-speed photography flashes and lasers.',
'37|Rb|Rubidium|85.468|312.46|961|1.532|0.82|Bunsen & Kirchhoff, 1861|Very reactive; used in atomic clocks and gives a red-violet flame.',
'38|Sr|Strontium|87.62|1050|1655|2.64|0.95|Adair Crawford, 1790|Produces the brilliant crimson red in fireworks.',
'39|Y|Yttrium|88.906|1799|3609|4.472|1.22|Johan Gadolin, 1794|Red phosphors in old TVs and YAG lasers; superconductors.',
'40|Zr|Zirconium|91.224|2128|4682|6.52|1.33|Martin Klaproth, 1789|Barely absorbs neutrons, so it cladds nuclear fuel rods.',
'41|Nb|Niobium|92.906|2750|5017|8.57|1.60|Charles Hatchett, 1801|Superconducting magnets for MRI and high-strength steel.',
'42|Mo|Molybdenum|95.95|2896|4912|10.28|2.16|Carl Scheele, 1778|Strengthens steel; a key metal in nitrogen-fixing enzymes.',
'43|Tc|Technetium|98|2430|4538|11.0|1.90|Perrier & Segrè, 1937|First artificially produced element; Tc-99m is used in medical imaging.',
'44|Ru|Ruthenium|101.07|2607|4423|12.45|2.20|Karl Claus, 1844|Hardens platinum and palladium; used in catalysts and contacts.',
'45|Rh|Rhodium|102.91|2237|3968|12.41|2.28|William Wollaston, 1803|Reflective and rare; key to catalytic converters.',
'46|Pd|Palladium|106.42|1828.05|3236|12.023|2.20|William Wollaston, 1803|Absorbs up to 900 times its volume of hydrogen; used as a catalyst.',
'47|Ag|Silver|107.87|1234.93|2435|10.49|1.93|Known since antiquity|Best conductor of electricity and heat; jewellery and photography.',
'48|Cd|Cadmium|112.41|594.22|1040|8.65|1.69|Friedrich Stromeyer, 1817|Used in Ni-Cd batteries; toxic.',
'49|In|Indium|114.82|429.75|2345|7.31|1.78|Reich & Richter, 1863|Indium tin oxide makes transparent touchscreens.',
'50|Sn|Tin|118.71|505.08|2875|7.287|1.96|Known since antiquity|Tin plating of cans and solder; alloyed with copper to form bronze.',
'51|Sb|Antimony|121.76|903.78|1860|6.685|2.05|Known since antiquity|Makes lead harder; used in flame retardants.',
'52|Te|Tellurium|127.60|722.66|1261|6.24|2.10|Franz Müller, 1782|Used in cadmium telluride solar panels.',
'53|I|Iodine|126.90|386.85|457.4|4.93|2.66|Bernard Courtois, 1811|Needed for thyroid hormones; sublimes into violet vapour.',
'54|Xe|Xenon|131.29|161.4|165.05|5.894|2.60|Ramsay & Travers, 1898|Used in car headlamps and ion thrusters; first noble gas to form compounds.',
'55|Cs|Caesium|132.91|301.59|944|1.873|0.79|Bunsen & Kirchhoff, 1860|Caesium atomic clocks define the second; most electropositive stable element.',
'56|Ba|Barium|137.33|1000|2118|3.594|0.89|Humphry Davy, 1808|BaSO₄ is the X-ray "barium meal"; gives green fireworks.',
'57|La|Lanthanum|138.91|1193|3737|6.145|1.10|Carl Mosander, 1839|Gives its name to the lanthanide series; used in camera lenses.',
'58|Ce|Cerium|140.12|1068|3716|6.77|1.12|Berzelius & Hisinger, 1803|Used in lighter flints and self-cleaning ovens.',
'59|Pr|Praseodymium|140.91|1208|3403|6.773|1.13|Carl von Welsbach, 1885|Colours glass and enamel yellow-green.',
'60|Nd|Neodymium|144.24|1297|3347|7.007|1.14|Carl von Welsbach, 1885|Makes the strongest permanent magnets for EV motors and headphones.',
'61|Pm|Promethium|145|1315|3273|7.26|1.13|Marinsky, Glendenin & Coryell, 1945|Radioactive; named after Prometheus who stole fire from the gods.',
'62|Sm|Samarium|150.36|1345|2067|7.52|1.17|Lecoq de Boisbaudran, 1879|Used in strong magnets and nuclear reactor control rods.',
'63|Eu|Europium|151.96|1099|1802|5.243|1.20|Eugène Demarçay, 1901|Red phosphor in screens; helps protect euro banknotes from forgery.',
'64|Gd|Gadolinium|157.25|1585|3546|7.895|1.20|Jean de Marignac, 1880|Contrast agent in MRI scans.',
'65|Tb|Terbium|158.93|1629|3503|8.229|1.10|Carl Mosander, 1843|Green phosphors in lighting and displays.',
'66|Dy|Dysprosium|162.50|1680|2840|8.55|1.22|Lecoq de Boisbaudran, 1886|Added to neodymium magnets so they work at high temperatures.',
'67|Ho|Holmium|164.93|1734|2993|8.795|1.23|Per Teodor Cleve, 1878|Has the highest magnetic moment of any element.',
'68|Er|Erbium|167.26|1802|3141|9.066|1.24|Carl Mosander, 1843|Amplifies signals in fibre-optic cables.',
'69|Tm|Thulium|168.93|1818|2223|9.321|1.25|Per Teodor Cleve, 1879|Rarest stable lanthanide; used in portable X-ray sources.',
'70|Yb|Ytterbium|173.05|1097|1469|6.965|1.10|Jean de Marignac, 1878|Used in highly precise atomic clocks.',
'71|Lu|Lutetium|174.97|1925|3675|9.84|1.27|Georges Urbain, 1907|Used in PET scan detectors; densest lanthanide.',
'72|Hf|Hafnium|178.49|2506|4876|13.31|1.30|Coster & von Hevesy, 1923|Used in nuclear control rods and modern chip insulators.',
'73|Ta|Tantalum|180.95|3290|5731|16.69|1.50|Anders Ekeberg, 1802|Used in tiny capacitors inside phones and laptops.',
'74|W|Tungsten|183.84|3695|5828|19.25|2.36|Fausto & Juan José de Elhuyar, 1783|Highest melting point of all metals; bulb filaments.',
'75|Re|Rhenium|186.21|3459|5869|21.02|1.90|Noddack, Tacke & Berg, 1925|One of the rarest elements; used in jet-engine alloys.',
'76|Os|Osmium|190.23|3306|5285|22.59|2.20|Smithson Tennant, 1803|Densest naturally occurring element.',
'77|Ir|Iridium|192.22|2719|4701|22.56|2.20|Smithson Tennant, 1803|Very corrosion resistant; an iridium layer marks the dinosaur extinction.',
'78|Pt|Platinum|195.08|2041.4|4098|21.45|2.28|Antonio de Ulloa, 1735|Catalytic converters, jewellery and anti-cancer drug cisplatin.',
'79|Au|Gold|196.97|1337.33|3129|19.3|2.54|Known since antiquity|Unreactive, malleable metal for jewellery and electronics.',
'80|Hg|Mercury|200.59|234.32|629.88|13.534|2.00|Known since antiquity|Only metal that is liquid at room temperature; very toxic.',
'81|Tl|Thallium|204.38|577|1746|11.85|1.62|William Crookes, 1861|Highly toxic; named after its green spectral line.',
'82|Pb|Lead|207.2|600.61|2022|11.34|2.33|Known since antiquity|Used in car batteries and radiation shielding; toxic.',
'83|Bi|Bismuth|208.98|544.4|1837|9.78|2.02|Claude Geoffroy, 1753|Nearly non-toxic heavy metal; used in stomach medicine and low-melting alloys.',
'84|Po|Polonium|209|527|1235|9.196|2.00|Marie & Pierre Curie, 1898|Named after Poland; intensely radioactive.',
'85|At|Astatine|210|575|610||2.20|Corson, MacKenzie & Segrè, 1940|The rarest naturally occurring element; very radioactive.',
'86|Rn|Radon|222|202|211.3|9.73||Friedrich Dorn, 1900|Radioactive noble gas that seeps from rocks into buildings.',
'87|Fr|Francium|223|300|950||0.79|Marguerite Perey, 1939|Extremely rare and unstable; most reactive alkali metal.',
'88|Ra|Radium|226|973|2010|5.5|0.90|Marie & Pierre Curie, 1898|Once used for glow-in-the-dark paints; highly radioactive.',
'89|Ac|Actinium|227|1323|3471|10.07|1.10|André-Louis Debierne, 1899|Gives its name to the actinide series; glows blue in the dark.',
'90|Th|Thorium|232.04|2115|5061|11.72|1.30|Jöns Berzelius, 1829|Weakly radioactive; a possible future nuclear fuel.',
'91|Pa|Protactinium|231.04|1841|4300|15.37|1.50|Hahn & Meitner, 1917|Rare and radioactive; decays into actinium.',
'92|U|Uranium|238.03|1405.3|4404|19.1|1.38|Martin Klaproth, 1789|Fuel for nuclear power plants (U-235).',
'93|Np|Neptunium|237|917|4273|20.45|1.36|McMillan & Abelson, 1940|First transuranic element.',
'94|Pu|Plutonium|244|912.5|3501|19.816|1.28|Seaborg et al., 1940|Used in nuclear reactors and in power sources for space probes.',
'95|Am|Americium|243|1449|2880|13.67|1.13|Seaborg et al., 1944|Found in ionisation smoke detectors.',
'96|Cm|Curium|247|1613|3383|13.51|1.28|Seaborg et al., 1944|Named in honour of Marie and Pierre Curie.',
'97|Bk|Berkelium|247|1259|2900|14.78|1.30|Berkeley Lab, 1949|Used as a target to synthesise heavier elements.',
'98|Cf|Californium|251|1173|1743|15.1|1.30|Berkeley Lab, 1950|Strong neutron emitter; used to start nuclear reactors.',
'99|Es|Einsteinium|252|1133|1269|8.84|1.30|Ghiorso et al., 1952|First found in the debris of a hydrogen bomb test.',
'100|Fm|Fermium|257||||1.30|Ghiorso et al., 1952|Named after Enrico Fermi; only made in tiny amounts.',
'101|Md|Mendelevium|258||||1.30|Ghiorso et al., 1955|Named after Dmitri Mendeleev, creator of the periodic table.',
'102|No|Nobelium|259||||1.30|Dubna group, 1958|Named after Alfred Nobel.',
'103|Lr|Lawrencium|266||||1.30|Ghiorso et al., 1961|Last of the actinides; named after Ernest Lawrence.',
'104|Rf|Rutherfordium|267|||||Dubna / Berkeley, 1964–69|First transactinide; named after Ernest Rutherford.',
'105|Db|Dubnium|268|||||Dubna / Berkeley, 1968–70|Named after the Russian research town Dubna.',
'106|Sg|Seaborgium|269|||||Berkeley Lab, 1974|Named after Glenn Seaborg while he was still alive.',
'107|Bh|Bohrium|270|||||GSI Darmstadt, 1981|Named after Niels Bohr.',
'108|Hs|Hassium|277|||||GSI Darmstadt, 1984|Named after the German state of Hesse.',
'109|Mt|Meitnerium|278|||||GSI Darmstadt, 1982|Named after Lise Meitner, co-discoverer of nuclear fission.',
'110|Ds|Darmstadtium|281|||||GSI Darmstadt, 1994|Named after the city of Darmstadt.',
'111|Rg|Roentgenium|282|||||GSI Darmstadt, 1994|Named after Wilhelm Röntgen, discoverer of X-rays.',
'112|Cn|Copernicium|285|||||GSI Darmstadt, 1996|Named after Nicolaus Copernicus.',
'113|Nh|Nihonium|286|||||RIKEN Japan, 2004|First element discovered in an Asian country.',
'114|Fl|Flerovium|289|||||Dubna, 1998|Named after the Flerov Laboratory in Dubna.',
'115|Mc|Moscovium|290|||||Dubna & Livermore, 2003|Named after the Moscow region.',
'116|Lv|Livermorium|293|||||Dubna & Livermore, 2000|Named after Lawrence Livermore Laboratory.',
'117|Ts|Tennessine|294|||||Dubna & Oak Ridge, 2010|Named after Tennessee, USA; second-last element of the table.',
'118|Og|Oganesson|294|||||Dubna & Livermore, 2002|Heaviest known element; named after Yuri Oganessian.',
];

const ORDER = ['1s','2s','2p','3s','3p','4s','3d','4p','5s','4d','5p','6s','4f','5d','6p','7s','5f','6d','7p'];
const OVERRIDE = {
  24: { '4s': 1, '3d': 5 }, 29: { '4s': 1, '3d': 10 }, 41: { '5s': 1, '4d': 4 }, 42: { '5s': 1, '4d': 5 },
  44: { '5s': 1, '4d': 7 }, 45: { '5s': 1, '4d': 8 }, 46: { '5s': 0, '4d': 10 }, 47: { '5s': 1, '4d': 10 },
  57: { '4f': 0, '5d': 1 }, 58: { '4f': 1, '5d': 1 }, 64: { '4f': 7, '5d': 1 }, 78: { '6s': 1, '5d': 9 },
  79: { '6s': 1, '5d': 10 }, 89: { '5f': 0, '6d': 1 }, 90: { '5f': 0, '6d': 2 }, 91: { '5f': 2, '6d': 1 },
  92: { '5f': 3, '6d': 1 }, 93: { '5f': 4, '6d': 1 }, 96: { '5f': 7, '6d': 1 }, 103: { '5f': 14, '6d': 0, '7p': 1 },
};
const CAP = { s: 2, p: 6, d: 10, f: 14 };
const NOBLES = [[86, 'Rn'], [54, 'Xe'], [36, 'Kr'], [18, 'Ar'], [10, 'Ne'], [2, 'He']];
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (n) => String(n).split('').map((d) => SUP[+d]).join('');

function configOf(z) {
  let left = z; const occ = {};
  for (const sub of ORDER) { const c = Math.min(left, CAP[sub[1]]); occ[sub] = c; left -= c; if (!left) break; }
  Object.assign(occ, OVERRIDE[z] || {});
  const shells = {};
  Object.entries(occ).forEach(([k, v]) => { if (v) shells[+k[0]] = (shells[+k[0]] || 0) + v; });
  const core = NOBLES.find(([n]) => n < z);
  const coreSubs = core ? ORDER.slice(0, ORDER.indexOf({ 2: '1s', 10: '2p', 18: '3p', 36: '4p', 54: '5p', 86: '6p' }[core[0]]) + 1) : [];
  const L = 'spdf';
  const rest = Object.keys(occ).filter((k) => occ[k] > 0 && !coreSubs.includes(k))
    .sort((a, b) => (+a[0] - +b[0]) || (L.indexOf(a[1]) - L.indexOf(b[1])));
  const text = (core ? `[${core[1]}] ` : '') + rest.map((k) => `${k}${sup(occ[k])}`).join(' ');
  return { text, shells: Object.keys(shells).sort((a, b) => a - b).map((k) => shells[k]) };
}

const LISTS = {
  alkali: [3, 11, 19, 37, 55, 87], alkaline: [4, 12, 20, 38, 56, 88],
  post: [13, 31, 49, 50, 81, 82, 83, 84, 113, 114, 115, 116], metalloid: [5, 14, 32, 33, 51, 52],
  nonmetal: [1, 6, 7, 8, 15, 16, 34], halogen: [9, 17, 35, 53, 85, 117], noble: [2, 10, 18, 36, 54, 86, 118],
};
function categoryOf(z) {
  for (const k of Object.keys(LISTS)) if (LISTS[k].includes(z)) return k;
  if (z >= 57 && z <= 71) return 'lanthanide';
  if (z >= 89 && z <= 103) return 'actinide';
  return 'transition';
}
function positionOf(z) {
  if (z === 1) return { period: 1, group: 1 };
  if (z === 2) return { period: 1, group: 18 };
  const ranges = [[3, 10, 2], [11, 18, 3], [19, 36, 4], [37, 54, 5], [55, 86, 6], [87, 118, 7]];
  const [start, , period] = ranges.find(([a, b]) => z >= a && z <= b);
  const o = z - start;
  if (period <= 3) return { period, group: o < 2 ? o + 1 : o + 11 };
  if (period <= 5) return { period, group: o + 1 };
  if (o < 2) return { period, group: o + 1 };
  if ((period === 6 && z >= 57 && z <= 71) || (period === 7 && z >= 89 && z <= 103)) return { period, group: null, fRow: period === 6 ? 9 : 10, fCol: o - 2 + 3 };
  return { period, group: period === 6 ? z - 72 + 4 : z - 104 + 4 };
}
const blockOf = (z, group) => (group === 1 || group === 2 || z === 2 ? 's' : group >= 13 ? 'p' : group ? 'd' : 'f');

export const CATEGORIES = [
  { id: 'alkali', label: 'Alkali metals', color: '#ff8a80' },
  { id: 'alkaline', label: 'Alkaline earth metals', color: '#ffb74d' },
  { id: 'transition', label: 'Transition metals', color: '#64b5f6' },
  { id: 'post', label: 'Post-transition metals', color: '#4db6ac' },
  { id: 'metalloid', label: 'Metalloids', color: '#aed581' },
  { id: 'nonmetal', label: 'Reactive non-metals', color: '#fff176' },
  { id: 'halogen', label: 'Halogens', color: '#f48fb1' },
  { id: 'noble', label: 'Noble gases', color: '#ce93d8' },
  { id: 'lanthanide', label: 'Lanthanides', color: '#80deea' },
  { id: 'actinide', label: 'Actinides', color: '#b39ddb' },
];
export const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
export const BLOCKS = [
  { id: 's', label: 's-block', color: '#ff8a80' }, { id: 'p', label: 'p-block', color: '#fff176' },
  { id: 'd', label: 'd-block', color: '#64b5f6' }, { id: 'f', label: 'f-block', color: '#81c784' },
];
export const STATES = [
  { id: 'Solid', label: 'Solid', color: '#ffcc80' }, { id: 'Liquid', label: 'Liquid', color: '#4fc3f7' },
  { id: 'Gas', label: 'Gas', color: '#f48fb1' }, { id: 'Unknown', label: 'Unknown', color: '#e0e0e0' },
];

export const ELEMENTS = RAW.map((row) => {
  const [z, sym, name, mass, melt, boil, dens, en, found, fact] = row.split('|');
  const Z = +z, pos = positionOf(Z), m = melt ? +melt : null, b = boil ? +boil : null;
  let state = 'Unknown';
  if (m !== null && b !== null) state = b < 298 ? 'Gas' : m < 298 ? 'Liquid' : 'Solid';
  const cfg = configOf(Z);
  const radioactive = Z === 43 || Z === 61 || Z >= 84;
  return {
    z: Z, sym, name, mass: radioactive && ![90, 91, 92].includes(Z) ? `[${mass}]` : mass,
    melt: m, boil: b, density: dens ? +dens : null, en: en ? +en : null, found, fact,
    category: categoryOf(Z), state, radioactive, config: cfg.text, shells: cfg.shells,
    period: pos.period, group: pos.group, block: blockOf(Z, pos.group),
    row: pos.fRow || pos.period, col: pos.fRow ? pos.fCol : pos.group,
  };
});
