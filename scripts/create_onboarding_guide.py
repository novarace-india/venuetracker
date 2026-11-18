from pathlib import Path
from shutil import copyfile
from xml.sax.saxutils import escape
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image, KeepTogether
import fitz

ROOT=Path.cwd()
OUT=ROOT/'output/pdf'
OUT.mkdir(parents=True,exist_ok=True)
(ROOT/'tmp/pdfs').mkdir(parents=True,exist_ok=True)
ASSET=ROOT/'docs/assets/scanner-success.png'
if (ROOT/'test-results/scanner-success.png').exists():
    copyfile(ROOT/'test-results/scanner-success.png',ASSET)
navy=colors.HexColor('#282462'); blue=colors.HexColor('#282462'); muted=colors.HexColor('#61758b'); light=colors.HexColor('#f4f2fa'); line=colors.HexColor('#dce5ef')
W,H=A4; WIDTH=W-96
styles={
 'title':ParagraphStyle('title',fontName='Helvetica-Bold',fontSize=29,leading=33,textColor=navy,spaceAfter=11),
 'deck':ParagraphStyle('deck',fontName='Helvetica',fontSize=11,leading=16,textColor=muted,spaceAfter=17),
 'h2':ParagraphStyle('h2',fontName='Helvetica-Bold',fontSize=12.4,leading=17,textColor=navy,spaceBefore=13,spaceAfter=7,keepWithNext=True),
 'body':ParagraphStyle('body',fontName='Helvetica',fontSize=10,leading=14.3,textColor=navy,spaceAfter=7),
 'small':ParagraphStyle('small',fontName='Helvetica',fontSize=8.3,leading=11.6,textColor=muted,spaceAfter=6),
 'cell':ParagraphStyle('cell',fontName='Helvetica',fontSize=9,leading=12.8,textColor=navy),
 'th':ParagraphStyle('th',fontName='Helvetica-Bold',fontSize=8.5,leading=12,textColor=navy),
 'eyebrow':ParagraphStyle('eyebrow',fontName='Helvetica-Bold',fontSize=8.2,leading=11,textColor=blue,spaceAfter=10),
}
# Content is authored once and used for both PDF and editable Markdown.
PAGES=[
('Start here','A practical guide for event organisers and gate volunteers.',[
 ('p','NovaRace Flow connects your guest list, event passes and gate tablets. Organisers prepare the event in the admin dashboard. Volunteers use the scanner app to check passes at a specific gate or counter.'),
 ('h','What you need before setup'),
 ('bullets',[
 'The live NovaRace Flow web address and organiser login, supplied by your setup team.',
 'A participant list with Email and Full Name, in Excel (.xlsx) or CSV format.',
 'Your checkpoint plan: for example Reception, Kit Collection, Meal and T-shirt.',
 'An Android tablet with Chrome for each scanning station, chargers and working internet for setup.',
 'A QR-capable hardware scanner, or permission to use the tablet camera.',
 'If emailing passes: SMTP settings and an approved sender address from your email provider.'
 ]),
 ('callout',('Use the live address','Every tablet must be able to open the same deployed NovaRace Flow site over HTTPS. A localhost address works only on the computer running it; it is not a link for volunteers on other devices. Ask your setup team for the live organiser link and the same site with /scanner added.')),
 ('h','Who does what'),
 ('table',(['Role','Responsibilities'],[
 ['Organiser / admin','Create events and gates, import guests, send passes, pair tablets, monitor progress and undo mistakes.'],
 ['Volunteer','Use the paired scanner, read the result, complete the gate action and refer exceptions to the event lead.'],
 ['Setup / technical team','Provide the working HTTPS site, email configuration and help with device or connectivity issues.']
 ],[112,WIDTH-112])),
 ('h','Follow this setup order'),
 ('p','Create event (page 2) > Add participants (page 2) > Create gates (page 3) > Send passes (page 4) > Pair tablets (page 5) > Connect scanners (page 6) > Rehearse and open gates (page 7).'),
 ('small','This guide matches the current NovaRace Flow interface. Screenshots use demonstration data. Keep admin credentials and one-time pairing codes within your event team.')
]),
('Create the event and guest list','Organiser dashboard | Complete this before sending passes.',[
 ('h','1. Create your event'),
 ('steps',[
 'Sign in using the organiser link. Choose Create event in the sidebar.',
 'Enter Event name, then IANA timezone. For an event in India, use Asia/Kolkata.',
 'Optionally fill Start (UTC). This field expects UTC, not local event time. For example, 12 December at 09:00 IST is 12 December at 03:30 UTC. Leave it blank if the start time is not needed.',
 'Select Save event. Confirm the correct event is selected in the sidebar before continuing. Use Edit event to change its details later.'
 ]),
 ('h','2. Prepare the participant file'),
 ('table',(['Column','What to enter'],[
 ['Email - required','One valid email address per participant; unique within this event.'],
 ['Full Name - required','The name volunteers should see when the pass is scanned.'],
 ['Phone, Ticket Type, Company','Optional details. Format phone cells as text to preserve + signs and leading zeros.'],
 ['Any other columns','Optional details such as dietary preference or T-shirt size; stored as metadata.']
 ],[148,WIDTH-148])),
 ('p','Use the provided participant template. Keep headers in the first row and guests on the first worksheet. The upload limit is 5 MB and 10,000 participant rows per file.'),
 ('h','3. Import or add guests'),
 ('steps',[
 'Open Participants > Import participants and choose your .xlsx or .csv file.',
 'Read the imported and rejected counts. Invalid rows and duplicate emails appear with an issue and row number.',
 'Correct rejected rows and upload only those corrected rows. Existing guests are not overwritten; re-uploaded emails are reported as duplicates.',
 'For one guest, choose Add participant, enter Full name and Email, and select Save participant. Keep Active pass selected for valid guests.',
 'Search by name or email to check your list. Use Edit to correct a profile, and QR to view or download a generated pass.'
 ]),
 ('callout',('Ready check','Find a known participant, check the spelling and email, and open QR. A pass is generated automatically; you do not need a separate QR generator.'))
]),
('Create gates and counters','Organiser dashboard | Gates are the checkpoints you want to track.',[
 ('p','A gate can represent entry, reception or any collection counter. Give each distinct checkpoint its own gate. Pair multiple tablets to the same gate when volunteers share the same allowance.'),
 ('h','1. Add a gate'),
 ('steps',[
 'Open Gates > Add gate.',
 'Enter a clear Gate name, such as Reception or Kit Collection.',
 'Set Maximum collections per participant. Use 1 for a single entry or one item per guest.',
 'Under Required previous gates, select any checkpoints that must already be completed. Leave all unchecked for an independent gate.',
 'Choose Save gate. Repeat for the remaining checkpoints. Use Edit gate if a rule needs changing.'
 ]),
 ('h','Example event plan'),
 ('table',(['Gate / counter','Maximum','Required previous gate'],[
 ['Reception','1','None'],
 ['Kit Collection','1','Reception'],
 ['Meal','1','Reception'],
 ['T-shirt','1','Reception'],
 ['Goodies','1','Reception and Kit Collection, if your event requires both']
 ],[150,65,WIDTH-215])),
 ('small','These are example rules, not automatic defaults. Choose dependencies that match your event. If more than one gate is selected, the guest must complete every selected gate first.'),
 ('callout',('Two tablets, one kit allowance','For two kit volunteers, create one Kit Collection gate and pair both tablets to it. Do not create Kit A and Kit B unless guests are meant to have separate allowances: separate gates have separate limits. Global limits are enforced when scans reach the server.')),
 ('h','2. Test the sequence'),
 ('p','With a test participant, scan at Kit Collection before Reception: it should be rejected with a message to visit Reception. Scan Reception, then Kit Collection: both should succeed in that order. Scan Kit Collection again: it should report Already collected.'),
 ('p','If you use a real guest for rehearsal, an admin must undo the test collections before doors open. Agree gate rules before the event; changing them during service affects later validations.')
]),
('Send QR passes to participants','Organiser dashboard | Configure delivery, test one pass, then send the guest list.',[
 ('h','1. Configure email delivery'),
 ('steps',[
 'Open Settings > SMTP delivery. Obtain the SMTP host, port, username, password or token, and verified sender email from your setup team.',
 'Enter the settings and choose Save SMTP settings. These settings are shared across this NovaRace Flow installation.',
 'For ZeptoMail, use the host shown in your own account. For the usual port 587 setup, leave Implicit TLS unchecked. If your provider specifies port 465, select Implicit TLS. Follow the provider account settings rather than guessing the region or host.'
 ]),
 ('h','2. Personalise the pass'),
 ('steps',[
 'Open Emails > Event pass template.',
 'Edit Subject and Message. Keep the message short and tell guests to have the QR ready at the event.',
 'Choose Save template. The QR image is included automatically; do not paste a QR image into the message.'
 ]),
 ('table',(['Variable','Replaced with'],[
 ['{{name}} / {{email}}','The participant name / email address'],
 ['{{event}}','The selected event name'],
 ['{{ticketType}} / {{company}}','The participant ticket type / company']
 ],[205,WIDTH-205])),
 ('h','3. Test, then send'),
 ('steps',[
 'Add an active test participant using an email inbox your team can access. In Participants, choose Email pass on that row.',
 'Confirm the message arrives, check the QR image and scan it on a paired tablet. If it does not arrive, check spam and the Email delivery status before sending more.',
 'When the test passes, open Emails > Send all passes and confirm. This queues passes for active participants.',
 'Monitor Email delivery. Queued or sending is not proof of delivery. Sent means the mail server accepted the email; check a sample inbox as well.',
 'For a failed job, correct the underlying issue and choose Retry. To send a delivered pass again, use Email pass in Participants.'
 ]),
 ('callout',('If email is unavailable','Use Participants > QR > Download QR to obtain a guest pass and distribute it using your event\'s approved method. Share the individual pass privately. Do not share screenshots of the full guest list.'))
]),
('Give volunteers the scanner app','Organiser + volunteer | Pair each tablet to the right event and gate.',[
 ('p','The volunteer app is the NovaRace Flow scanner at the same live site with /scanner added. It opens in Chrome and can be installed on the tablet home screen. There is no separate app-store download and volunteers do not need the organiser password.'),
 ('h','1. Organiser: prepare the tablet assignment'),
 ('steps',[
 'Select the event, open Gates, and choose Pair a tablet on the intended gate.',
 'Give the volunteer the scanner link and the new 8-digit pairing code. A code expires after 10 minutes and can be used only once.',
 'Generate a separate code for every tablet, even when several tablets share one gate.'
 ]),
 ('h','2. Volunteer: pair the tablet'),
 ('steps',[
 'Connect the tablet to the internet and open the organiser-provided scanner link in Chrome. Use a normal browser window, not Incognito.',
 'Enter Tablet name using a recognisable label, such as Reception - Tablet 1.',
 'Enter the 8-digit pairing code and choose Pair this tablet.',
 'Check the event name, gate name and tablet name displayed on the scanner screen. Confirm Ready to scan appears. Stop and ask the organiser if the assignment is wrong.'
 ]),
 ('h','3. Make it easy to use at the gate'),
 ('steps',[
 'If Chrome offers Install app or Add to Home screen, use it to add NovaRace Flow to the tablet. Menu wording can vary. You can also use the scanner directly in Chrome.',
 'Open the installed app or scanner link and tap the fullscreen control at the top right if needed. Keep the screen awake using the tablet settings or your managed-device settings.',
 'While online, complete a test scan. Before relying on offline mode, ask the setup team to confirm it is enabled on the deployed site, then temporarily disconnect and confirm the scanner can reopen. Reconnect before the gate opens.'
 ]),
 ('callout',('Before handing over','Label the tablet and its physical counter. The organiser can check Devices for the tablet name, assigned gate and last-seen time. Pairing confirms the assignment; it does not replace a real hardware or camera test.')),
 ('p','If a tablet must move to another gate, first reconnect and confirm 0 queued. Then use Device options > Remove pairing and pair it again with a fresh code for the new gate. Never change pairing while scans are pending.')
]),
('Connect a scanner or use the camera','Volunteer + setup team | Test with a real NovaRace Flow QR pass.',[
 ('callout',('Choose QR-capable hardware','NovaRace Flow passes are QR codes. A scanner that reads only 1D barcodes cannot read them. Use a 2D QR-capable scanner in USB HID or Bluetooth HID keyboard mode. A successful hardware beep only means it read the code; the NovaRace Flow screen gives the collection result.')),
 ('h','Option A - USB scanner'),
 ('steps',[
 'Connect the scanner to the tablet using its supported USB connection. A tablet may need a compatible USB-C OTG adapter or powered hub.',
 'Use the scanner manufacturer\'s setup guide or configuration barcodes to select USB HID / Keyboard mode and an Enter (carriage-return) suffix.',
 'Open NovaRace Flow and keep Ready to scan visible. Close dialogs and aim the scanner at a guest QR code.',
 'If the scanner beeps but nothing happens, tap the Scanner input or paste QR text field and scan again. If text appears without submitting, check the Enter suffix or tap Scan.',
 'Check the on-screen guest name and result before completing the gate action.'
 ]),
 ('h','Option B - Bluetooth scanner'),
 ('steps',[
 'Put the scanner in Bluetooth HID / Keyboard mode and follow its manufacturer\'s instructions to pair it through the tablet Bluetooth settings. Some scanners use a USB receiver instead; follow that model\'s instructions.',
 'Set the Enter suffix. Keep the scanner charged and make sure it is connected to the intended tablet, not a nearby device.',
 'Return to NovaRace Flow and test a QR pass. If text lands in the scanner input but does not submit, use Scan and ask the setup team to fix the suffix.'
 ]),
 ('h','Option C - Tablet camera'),
 ('steps',[
 'On the scanner screen, choose Camera. Allow camera access if Chrome asks.',
 'Hold the full QR inside the camera view. Increase the guest phone brightness, avoid glare and keep the code steady. NovaRace Flow requests the rear camera where available.',
 'When the code is read, the camera view closes and the scan result appears. Use the result on screen, not just the camera action, to decide what to do.',
 'If access is blocked, ask the setup team to check camera permission for the site and confirm the live link uses HTTPS. Close other apps using the camera, then retry.'
 ]),
 ('small','Scanner settings and adapters depend on the hardware model. Ask the setup team to configure each model before volunteers arrive; the NovaRace Flow app cannot change the scanner\'s HID mode or suffix.')
]),
('Read scan results','Volunteer | Read the message, check the guest name, then act.',[
 ('image',('docs/assets/scanner-success.png',265,'Example: a server-confirmed collection, shown with demonstration guest data.')),
 ('table',(['Screen result','Volunteer action'],[
 ['Green - collection confirmed','Complete the gate action for the displayed guest.'],
 ['Amber - already collected','Check the previous collection timestamp. Do not issue the item or entry again; refer a dispute to the event lead.'],
 ['Red - scan not accepted','Read the reason. Direct the guest to the required gate, correct event pass, or organiser help desk.'],
 ['Amber - pending validation','Saved on this tablet, but not yet approved. Wait for confirmation before issuing controlled items or follow the event lead\'s explicit provisional procedure.']
 ],[166,WIDTH-166])),
 ('h','If the network drops'),
 ('p','Keep the same tablet and app. Offline scans are queued, but changed rules, deactivated passes and other tablets\' collections cannot be checked until sync. Offline mode cannot guarantee duplicate prevention across tablets.'),
 ('p','Reconnect, keep NovaRace Flow open, and choose Sync now if needed. Wait for 0 queued, then open Recent results and review any rejected or already-collected scans. The Online label alone does not prove that syncing has completed.'),
 ('small','Do not clear site data, uninstall the app, remove pairing or switch to Incognito while scans are queued. If the app says a scan was NOT saved, stop: that scan is not safely queued. Ask for help rather than handing out an item on that basis.')
]),
('Resolve issues and close','Organiser + event lead | Resolve issues without losing scan history.',[
 ('h','Broken phone or an approved exception'),
 ('p','Follow your event\'s identity-check and approval process. While online, choose Manual override > Find participant. Enter at least two characters of a name or email, select the guest and enter a specific Reason for override. Choose Record manual collection and check the result.'),
 ('callout',('Use overrides carefully','Overrides bypass gate order and collection limits and are audited. They cannot activate a deactivated guest. Paired volunteers have this action; agree who may approve it before doors open.')),
 ('h','Common problems'),
 ('table',(['Problem','What to do'],[
 ['Pairing code rejected','Request a fresh code for the right gate. Codes expire after 10 minutes and work once.'],
 ['Scanner beeps; no result','Check QR support, HID mode and Enter suffix. Focus the scanner input and retry.'],
 ['Camera will not open','Check site camera permission, HTTPS and other camera apps. Try hardware scanning.'],
 ['Wrong sequence or event','Direct the guest to the named previous gate or request this event\'s pass.'],
 ['Pass deactivated or unknown','Refer to the organiser. Keep your identity checks in place.'],
 ['Sync paused / authorisation failed','Preserve queued data. Ask the technical team to investigate; do not revoke or re-pair.']
 ],[154,WIDTH-154])),
 ('h','Correct a mistaken collection - admin only'),
 ('p','In Participants, find the guest and choose Collections. Review the counter, choose Undo latest or Reset all at this counter, enter a reason and confirm any impact warning. Ask the volunteer to tap Sync now online, then scan the same QR again. Audit history is retained; downstream counters are not automatically reset.'),
 ('h','Before doors open and before you close'),
 ('p','Before opening: check tablet assignments, charging, connectivity and scanners. Rehearse results and undo test collections. During service, Overview refreshes about every five seconds; Devices shows assignments and last-seen times.'),
 ('p','At close: reconnect all tablets, confirm 0 queued and review Recent results. In Settings, use Export scan log and Export participant status for your records. Resolve queues before revoking or unpairing devices. Exports use UTC; screens use the event timezone.')
])
]

QUICK=[
 ('p','Keep this page at the counter. Your organiser supplies the scanner link and pairing code.'),
 ('h','Before the first guest'),
 ('steps',[
 'Open the live NovaRace Flow scanner link in Chrome. If pairing is required, enter Tablet name and the organiser\'s fresh 8-digit code, then choose Pair this tablet.',
 'Check the event and gate names. Connect your QR-capable scanner in HID keyboard mode with an Enter suffix, or choose Camera and allow access.',
 'Test a pass with the organiser. Keep the tablet charged, the scanner screen open, and Ready to scan visible.'
 ]),
 ('h','For each guest'),
 ('p','Ask for the event QR pass. Scan once, check the name, and follow the result below. A scanner beep is not approval.'),
 ('table',(['Result','What you do'],[
 ['GREEN - confirmed','Complete the gate action for this guest.'],
 ['AMBER - already collected','Check the earlier time. Do not issue again; ask the event lead if disputed.'],
 ['RED - not accepted','Read the reason. Direct the guest to the correct previous gate or organiser help desk.'],
 ['AMBER - pending validation','Saved locally, not approved yet. Wait for confirmation or follow the lead\'s explicit provisional procedure.']
 ],[171,WIDTH-171])),
 ('h','Offline or connection problem'),
 ('p','Keep the same app and tablet. Reconnect, leave NovaRace Flow open, tap Sync now, wait for 0 queued, and review Recent results. Offline scans cannot check other tablets\' collections until syncing.'),
 ('callout',('Protect queued scans','Do not clear site data, uninstall, remove pairing or use Incognito. If a scan was NOT saved, stop and call the event lead. Online alone does not mean the queue has synced.')),
 ('h','Need help?'),
 ('p','Scanner silent or text not submitted? Focus the scanner input; check HID mode and Enter suffix. Camera blocked? Ask the setup team to check camera permission and HTTPS. Broken phone? Verify identity and get approval before Manual override. It needs an online lookup and a reason, and can bypass limits and gate order.'),
 ('small','Before handover or shutdown: confirm 0 queued and report unresolved scans to the event lead. Volunteers do not need the organiser password. Do not share your tablet\'s access outside the event team.')
]


def para(s,style='body'):
    # Author copy is literal; highlighting is supplied by headings and tables.
    return Paragraph(escape(s),styles[style])
def table(headers,rows,widths):
    data=[[para(s,'th') for s in headers]]+[[para(s,'cell') for s in r] for r in rows]
    t=Table(data,colWidths=widths,hAlign='LEFT',repeatRows=1)
    t.setStyle(TableStyle([
      ('BACKGROUND',(0,0),(-1,0),light),('VALIGN',(0,0),(-1,-1),'TOP'),
      ('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),
      ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),
      ('LINEBELOW',(0,0),(-1,0),.7,line),('LINEBELOW',(0,1),(-1,-1),.35,line)
    ]));return t

def flow(blocks):
    story=[]
    for kind,val in blocks:
      if kind=='p':story.append(para(val))
      elif kind=='small':story.append(para(val,'small'))
      elif kind=='h':story.append(para(val,'h2'))
      elif kind in ('steps','bullets'):
        for i,s in enumerate(val):
          prefix=f'{i+1}.' if kind=='steps' else '-'
          t=Table([[para(prefix,'cell'),para(s)]],colWidths=[21,WIDTH-21]);t.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),4),('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),0)]));story.append(t)
      elif kind=='callout':
        title,text=val
        t=Table([[para(title,'th')],[para(text,'cell')]],colWidths=[WIDTH]);t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),colors.HexColor('#f1eff9')),('BOX',(0,0),(-1,-1),.5,colors.HexColor('#ddd7ef')),('LEFTPADDING',(0,0),(-1,-1),12),('RIGHTPADDING',(0,0),(-1,-1),12),('TOPPADDING',(0,0),(-1,0),10),('BOTTOMPADDING',(0,-1),(-1,-1),11)]));story.extend([Spacer(1,5),t,Spacer(1,9)])
      elif kind=='table':story.extend([table(*val),Spacer(1,9)])
      elif kind=='image':
        path,width,caption=val
        from PIL import Image as PILImage
        with PILImage.open(ROOT/path) as img:height=width*img.height/img.width
        story.extend([Image(str(ROOT/path),width=width,height=height),Spacer(1,5),para(caption,'small'),Spacer(1,6)])
    return story

def chrome(canvas,doc):
    canvas.saveState()
    canvas.setFillColor(navy);canvas.roundRect(48,H-46,W-96,31,4,fill=1,stroke=0)
    canvas.drawImage(str(ROOT/'apps/web/public/brand/novarace-white.png'),55,H-42,width=61,height=25,mask='auto')
    canvas.setFillColor(colors.white);canvas.setFont('Helvetica-Bold',13);canvas.drawString(128,H-36,'Flow')
    canvas.setFont('Helvetica',7);canvas.drawRightString(W-55,H-34,'ORGANISER & VOLUNTEER GUIDE')
    canvas.setStrokeColor(line);canvas.line(48,39,W-48,39)
    canvas.setFillColor(muted);canvas.setFont('Helvetica',7.5);canvas.drawString(48,25,'NovaRace Flow | Event operations | 18 November 2026');canvas.drawRightString(W-48,25,f'{doc.page}')
    canvas.restoreState()

main=[]
for idx,(title,deck,blocks) in enumerate(PAGES,1):
    if idx>1:main.append(PageBreak())
    main.extend([para(f'{idx:02d} / ORGANISER ONBOARDING','eyebrow'),para(title,'title'),para(deck,'deck')]);main.extend(flow(blocks))
SimpleDocTemplate(str(OUT/'NovaRace-Flow-Organiser-Onboarding-Guide.pdf'),pagesize=A4,rightMargin=48,leftMargin=48,topMargin=57,bottomMargin=53,title='NovaRace Flow - Organiser onboarding guide',author='NovaRace Flow').build(main,onFirstPage=chrome,onLaterPages=chrome)
styles['body'].fontSize=9.5
styles['body'].leading=13
styles['body'].spaceAfter=6
styles['h2'].spaceBefore=10
styles['h2'].spaceAfter=6
quick=[para('GATE VOLUNTEER / QUICK REFERENCE','eyebrow'),para('Scan. Check. Act.','title')]+flow(QUICK)
SimpleDocTemplate(str(OUT/'NovaRace-Flow-Volunteer-Quick-Reference.pdf'),pagesize=A4,rightMargin=48,leftMargin=48,topMargin=57,bottomMargin=53,title='NovaRace Flow - Volunteer quick reference',author='NovaRace Flow').build(quick,onFirstPage=chrome,onLaterPages=chrome)


def markdown(blocks):
    out=[]
    for kind,val in blocks:
      if kind in ['p','small']:out.extend([val,''])
      elif kind=='h':out.extend(['### '+val,''])
      elif kind in ['steps','bullets']:
        out.extend([(f'{i+1}. ' if kind=='steps' else '- ')+text for i,text in enumerate(val)]);out.append('')
      elif kind=='callout':out.extend(['> **'+val[0]+'**','>','> '+val[1],''])
      elif kind=='table':
        headers,rows,_=val
        out.append('| '+' | '.join(headers)+' |');out.append('| '+' | '.join(['---']*len(headers))+' |')
        out.extend(['| '+' | '.join(row)+' |' for row in rows]);out.append('')
      elif kind=='image':out.extend(['![Server-confirmed scan example](assets/scanner-success.png)',val[2],''])
    return '\n'.join(out)
md=['# NovaRace Flow: organiser onboarding guide','','For event organisers, gate leads and volunteers. Updated 18 November 2026.','']
for idx,(title,deck,blocks) in enumerate(PAGES,1):md.extend([f'## {idx}. {title}','',deck,'',markdown(blocks),''])
(ROOT/'docs/onboarding-guide.md').write_text('\n'.join(md))
(ROOT/'docs/volunteer-quick-reference.md').write_text('# NovaRace Flow: volunteer quick reference\n\n'+markdown(QUICK))

for path in OUT.glob('NovaRace-Flow-*.pdf'):
    doc=fitz.open(path);print(path.name,len(doc),'pages')
    for i,page in enumerate(doc):
      pix=page.get_pixmap(matrix=fitz.Matrix(1.1,1.1),alpha=False);pix.save(ROOT/f'tmp/pdfs/{path.stem}-{i+1}.png')
      for b in page.get_text('blocks'):
        if b[1]<12 or b[3]>H-12:raise RuntimeError(f'Text out of page bounds: {path.name} p{i+1}: {b}')

# Preserve previously shared local document links with the new branded contents.
copyfile(OUT/'NovaRace-Flow-Organiser-Onboarding-Guide.pdf',OUT/'GateCheck-Organiser-Onboarding-Guide.pdf')
copyfile(OUT/'NovaRace-Flow-Volunteer-Quick-Reference.pdf',OUT/'GateCheck-Volunteer-Quick-Reference.pdf')
