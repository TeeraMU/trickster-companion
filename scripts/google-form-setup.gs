/**
 * Trickster Companion: creates the "Report" Google Form (no login needed for players)
 * and a Google Sheet that collects the answers.
 *
 * How to use (once, with the project owner's Google account):
 *   1. Open https://script.google.com  ->  New project
 *   2. Delete everything in the editor, paste this whole file, press Save (💾)
 *   3. Choose the function "createTricksterReportForm" at the top and press Run (▶)
 *   4. Allow the permissions it asks for (it creates one form and one sheet in your Drive)
 *   5. Open "Execution log" at the bottom and send the PREFILLED LINK line to Claude
 *
 * Players can send without signing in. The app opens the form with the quest / pins already
 * filled in through the prefilled link (entry ids are printed in the log).
 */
function createTricksterReportForm() {
  const form = FormApp.create('Trickster Companion – Report / แจ้งปัญหา');
  form.setDescription(
    'Tell us about wrong quest info, a bug, or send NPC pins. No sign-in needed.\n' +
    'แจ้งข้อมูลเควสผิด บั๊ก หรือส่งหมุด NPC ได้เลย ไม่ต้องล็อกอิน\n\n' +
    'Trickster Companion is a non-commercial fan project.'
  );

  // Anyone with the link can answer; no e-mail is collected.
  tryCall(() => form.setEmailCollectionType(FormApp.EmailCollectionType.DO_NOT_COLLECT));
  tryCall(() => form.setCollectEmail(false));
  tryCall(() => form.setRequireLogin(false)); // only exists for Google Workspace accounts
  form.setLimitOneResponsePerUser(false);
  form.setAllowResponseEdits(false);
  form.setShowLinkToRespondAgain(true);
  form.setConfirmationMessage('Thanks! / ขอบคุณครับ 🙏  We will check it soon.');

  const TYPES = [
    'Wrong quest info / ข้อมูลเควสผิด',
    'Bug / ใช้งานไม่ได้',
    'NPC pins / หมุด NPC',
    'Idea / ไอเดีย'
  ];
  const type = form.addMultipleChoiceItem()
    .setTitle('What are you sending? / แจ้งเรื่องอะไร')
    .setChoiceValues(TYPES)
    .setRequired(true);

  const quest = form.addTextItem()
    .setTitle('Quest / เควส')
    .setHelpText('Filled in by the app when you press "Report" on a quest. / แอปกรอกให้เมื่อกด Report จากเควส');

  const details = form.addParagraphTextItem()
    .setTitle('What is wrong or what happened? / รายละเอียด')
    .setHelpText('e.g. "Bunny Maid asks for 3x Baby Carrot, not 2" / เช่น "Bunny Maid ขอ Baby Carrot 3 ชิ้น ไม่ใช่ 2"');

  const pins = form.addParagraphTextItem()
    .setTitle('NPC pins (filled in by the app, please don\'t edit) / หมุด NPC (แอปกรอกให้ ไม่ต้องแก้)');

  form.addTextItem()
    .setTitle('Phone / computer and browser (optional) / อุปกรณ์และเบราว์เซอร์ (ไม่บังคับ)');

  form.addTextItem()
    .setTitle('Your name in game (optional) / ชื่อในเกม (ไม่บังคับ)');

  // Answers go to a new Google Sheet.
  const sheet = SpreadsheetApp.create('Trickster Companion – Reports (answers)');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());

  // Newer Google Forms keep new forms unpublished until "Publish" is pressed.
  const published = tryCall(() => { form.setPublished(true); return true; });

  // A prefilled link: Claude reads the entry ids from it to build the app's links.
  const prefilled = form.createResponse()
    .withItemResponse(type.createResponse(TYPES[0]))
    .withItemResponse(quest.createResponse('QUEST'))
    .withItemResponse(details.createResponse('DETAILS'))
    .withItemResponse(pins.createResponse('PINS'))
    .toPrefilledUrl();

  Logger.log('FORM (edit):      ' + form.getEditUrl());
  Logger.log('FORM (players):   ' + form.getPublishedUrl());
  Logger.log('ANSWERS (sheet):  ' + sheet.getUrl());
  Logger.log('PREFILLED LINK:   ' + prefilled);
  Logger.log(published
    ? 'Published: yes. Players can open the form now.'
    : 'Published: please open the form (edit link above) and press "Publish" / "เผยแพร่", responders: Anyone with the link.');
}

function tryCall(fn) {
  try { return fn(); } catch (e) { Logger.log('(skipped: ' + e.message + ')'); return false; }
}
