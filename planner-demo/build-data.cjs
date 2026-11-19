// Generate the demo's compact item list from the separately extracted client tables.
const fs = require('fs');
const path = require('path');
const src = process.argv[2] || 'G:/Claude/playtrickster-extraction/item-catalog/equipment-class-2.json';
const rows = JSON.parse(fs.readFileSync(src, 'utf8'));
const attributesFile = 'G:/Claude/playtrickster-extraction/json/items_equipment/Item_Attribute.json';
const attrs = new Map(JSON.parse(fs.readFileSync(attributesFile, 'utf8')).rows.map(row => [row.ID, row]));
const elementFields = ['Fire','Water','Wind','Earth','Elec','Light','Dark'];
const types = {2:'weapon',3:'hat',4:'innerwear',7:'accessory',8:'shield',13:'pet',17:'ear',18:'tail',19:'fashion',20:'fashion',21:'fashion',22:'fashion',23:'fashion',24:'fashion',25:'fashion',26:'fashion',27:'fashion',34:'cape'};
const fields = {AP:'APPlus',AC:'ACPlus',DX:'DXPlus',MP:'MaxMPPlus',MA:'MAPlus',MD:'MDPlus',WT:'MaxWTPlus',DA:'DAPlus',LK:'LKPlus',HP:'MaxHPPlus',DP:'DPPlus',HV:'HVPlus'};
const items = rows.filter(x => types[x.Type] && x.Name?.trim()).map(x => ({
  id:x.ID, name:x.Name.trim(), slot:types[x.Type], level:Number(x.MinLevel)||0, source:x.sourceTable,
  stats:Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,Number(x[v])||0]).filter(([,v])=>v!==0)),
  elements:Object.fromEntries(elementFields.map(k=>[k,Number(attrs.get(x.ID)?.[k])||0]).filter(([,v])=>v!==0))
}));
fs.writeFileSync(path.join(__dirname,'equipment.json'),JSON.stringify(items));
console.log(`Wrote ${items.length} equipment records`);
