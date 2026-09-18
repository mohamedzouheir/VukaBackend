/*
 * English, and the source of truth for the key set.
 *
 * Every other language is typed against this one, so a missing key is a compile error rather
 * than a word that silently falls back on a screen nobody happened to open in isiXhosa.
 *
 * <h2>How the keys are grouped</h2>
 *
 * By where the string appears rather than by what it says: chrome for the frame, common for the
 * words that repeat everywhere, then one group per screen. A translator works through a screen at
 * a time, not through an alphabetical list of fragments.
 *
 * <h2>The vocabulary that must not drift</h2>
 *
 * Some of these carry legal or audit meaning and cannot be loosely rendered:
 *
 *   unverifiable against unverified  the Auditor-General's distinction, and the whole argument
 *                                    for attaching evidence to a figure
 *   statutory against departmental   PFMA sections 55 and 65 are law; the thirty day quarterly
 *                                    figure is a National Treasury guideline
 *   no result reported               never "zero". The difference between not done and not
 *                                    reported is the subject of this product
 *   arithmetic, not a prediction     the sentence the risk engine is defensible on
 *
 * Those four are marked below. A translator who changes them changes what the product claims.
 */
export const en = {
  /* ---------------------------------------------------------------- chrome */
  'nav.dashboard': 'Dashboard',
  'nav.today': 'Today',
  'nav.portfolio': 'Portfolio',
  'nav.reviewQueue': 'Review queue',
  'nav.administration': 'Administration',
  'nav.entities': 'Entities',
  'nav.reports': 'Reports',
  'nav.myReporting': 'My reporting',
  'nav.documents': 'Documents',
  'nav.analytics': 'Analytics & Insights',
  'nav.risk': 'Risk & Alerts',
  'nav.workspaces': 'Workspaces',
  'nav.tasks': 'Tasks',
  'nav.audit': 'Audit trail',
  'nav.citizenView': 'Citizen View',
  'nav.settings': 'Settings',
  'nav.backHome': 'Back to Home',
  'nav.language': 'Language',
  'nav.tagline': 'Transparent. Accountable. Impactful.',
  'nav.search': 'Search entities, reports, documents...',
  'nav.searchLabel': 'Search entities, reports and documents',
  'nav.signOut': 'Sign out',
  'nav.alerts': 'Alerts',
  'nav.openNav': 'Open the navigation',
  'nav.collapse': 'Collapse the navigation',
  'nav.expand': 'Expand the navigation',
  'nav.devBanner':
    'Development sign in is enabled. Tokens are not verified and any role can be assumed. Never run a deployed environment this way.',

  'role.reporter': 'Entity reporter',
  'role.reviewer': 'DSAC reviewer',
  'role.executive': 'DSAC executive, read only',
  'role.admin': 'DSAC admin',

  'dept.name': 'sport, arts & culture',
  'dept.line1': 'Department:',
  'dept.line2': 'Sport, Arts and Culture',
  'dept.line3': 'REPUBLIC OF SOUTH AFRICA',
  'dept.motto': 'Better reporting. Stronger institutions. A brighter South Africa.',

  'foot.rights': 'Department of Sport, Arts and Culture. Republic of South Africa.',
  'foot.privacy': 'Privacy',
  'foot.terms': 'Terms',
  'foot.help': 'Help',

  /* ---------------------------------------------------------------- common */
  'common.loading': 'Loading {0}.',
  'common.tryAgain': 'Try again',
  'common.notFound':
    'No such {0}. If you followed a link, it may have been for a different entity or a different period.',
  'common.cancel': 'Cancel',
  'common.back': 'Back',
  'common.next': 'Next',
  'common.close': 'Close',
  'common.open': 'Open',
  'common.save': 'Save',
  'common.submit': 'Submit',
  'common.export': 'Export CSV',
  'common.download': 'Download',
  'common.upload': 'Upload',
  'common.search': 'Search',
  'common.reset': 'Reset',
  'common.all': 'All',
  'common.none': 'None',
  'common.of': 'of',
  'common.showAll': 'Show all',
  'common.viewAll': 'View all',
  'common.optional': 'optional',
  'common.required': 'required',
  'common.notRecorded': 'Not recorded',
  'common.notSet': 'not set',
  'common.notApplicable': 'not applicable',
  'common.noAllocationRow': 'no allocation row',
  /* Never "zero". The difference between not done and not reported is the whole subject. */
  'common.noResultReported': 'No result reported',
  'common.page': 'page',
  'common.entity': 'entity',
  'common.submission': 'submission',
  'common.record': 'record',

  'status.draft': 'Draft',
  'status.submitted': 'Submitted',
  'status.underReview': 'Under review',
  'status.returned': 'Returned',
  'status.approved': 'Approved',
  'status.notStarted': 'No result reported',
  'status.inProgress': 'In progress',
  'status.achieved': 'Achieved',
  'status.missed': 'Missed',
  'status.open': 'Open',
  'status.done': 'Done',

  'band.low': 'LOW',
  'band.medium': 'MEDIUM',
  'band.high': 'HIGH',
  'band.critical': 'CRITICAL',
  'band.notScored': 'NOT SCORED',
  'band.notScoredLong': 'Not yet scored',

  'sector.arts': 'Arts',
  'sector.heritage': 'Heritage',
  'sector.sport': 'Sport',
  'sector.libraries': 'Libraries',
  'sector.language': 'Language',
  'sector.other': 'Other',

  /* ---------------------------------------------------------------- risk */
  'signal.lateness': 'Submission lateness',
  'signal.evidenceGap': 'Evidence gap',
  'signal.spendDelivery': 'Spend to delivery divergence',
  'signal.auditFinding': 'Prior audit findings',
  'signal.revisionChurn': 'Revision churn',
  'risk.weight': 'weight {0}',
  'risk.contributes': 'contributes {0}',
  'risk.total': 'Total',
  'risk.scoreUnavailable': 'Score unavailable',
  'risk.noSignals':
    'No signals stored for this period. This entity has not been scored yet, which is not the same as having scored zero.',
  'risk.notStoredSignal':
    'Not stored for this period. The engine records a signal only where it had an input, and an absent input is treated as absence of evidence rather than as a zero.',
  /* The sentence the whole risk engine is defensible on. Keep the contrast between arithmetic
     and prediction in every language. */
  'risk.method':
    'Weights are fixed and published. Bands: 25 medium, 50 high, 70 critical. This score is arithmetic, not a prediction, and can be reproduced by hand from the figures above.',
  'risk.explain': 'Explain the score',
  'risk.recompute': 'Recompute scores',
  'risk.largestFactor': 'Largest factor',
  'risk.noneMaterial': 'none material',

  /* ---------------------------------------------------------------- evidence */
  /* The Auditor-General's distinction. Unverifiable means it cannot be checked at all, which is
     worse than unverified, meaning nobody has got round to it. Both words are needed. */
  'evidence.unverifiable': 'unverifiable',
  'evidence.unverified': 'unverified',
  'evidence.none':
    'No evidence attached. This figure will show to the Department as {0}, which is different from {1}.',
  'evidence.traceable': 'Traceable to source.',
  'evidence.attachedNotTraceable': 'Attached, but the reliability test is not yet satisfied.',
  'evidence.satisfies': 'Satisfies {0}.',
  'evidence.attach': 'attach',
  'evidence.add': 'add',
  'evidence.files': '{0} files on record',

  /* ---------------------------------------------------------------- deadlines */
  /* Statutory and departmental are not interchangeable: PFMA sections 55 and 65 are law, the
     thirty day quarterly figure is a National Treasury guideline. */
  'deadline.statutory': 'Statutory date.',
  'deadline.notStatutory': 'Not a statutory date.',
  'deadline.due': 'Due {0}',
  'deadline.daysLeft': '{0} days left',
  'deadline.oneDayLeft': '1 day left',
  'deadline.dueToday': 'due today',
  'deadline.daysLate': '{0} days late',
  'deadline.oneDayLate': '1 day late',
  'deadline.noPeriod':
    'No open reporting period. Periods are opened by the Department for each quarter of the financial year.',

  /* ---------------------------------------------------------------- state line */
  'state.waitingOnYou': 'Waiting on you.',
  'state.waitingOnEntity': 'Waiting on the entity.',
  'state.waitingOnDept': 'Waiting on the Department.',
  'state.deptHolds': 'The Department holds it.',
  'state.closed': 'Closed.',

  /* ---------------------------------------------------------------- dashboard */
  'dash.morning': 'Good morning',
  'dash.afternoon': 'Good afternoon',
  'dash.evening': 'Good evening',
  'dash.subDsac': 'Where the portfolio stands this quarter, and what is waiting on the Department.',
  'dash.subReporter': 'Where your reporting stands this quarter, and what is waiting on you.',
  'dash.fundedBodies': 'Funded bodies',
  'dash.fundedBodiesSub': 'Receiving an entity transfer',
  'dash.submitted': 'Submitted',
  'dash.outstanding': 'Outstanding',
  'dash.outstandingSub': 'Nothing filed this period',
  'dash.critical': 'Critical entities',
  'dash.criticalSub': 'Score of 70 or above',
  'dash.allocated': 'Allocated this year',
  'dash.riskDistribution': 'Risk distribution',
  'dash.recentSubmissions': 'Recent submissions',
  'dash.yourPeriods': 'Your reporting periods',
  'dash.quickActions': 'Quick actions',
  'dash.myTasks': 'My tasks',
  'dash.nothingAssigned': 'Nothing assigned to you.',
  'dash.targetsYear': 'Targets this year',
  'dash.targetsYearSub': 'From your tabled plan',
  'dash.figuresConfirmed': 'Figures confirmed',
  'dash.figuresConfirmedSub': 'In your name, not editable',
  'dash.evidenceAttached': 'Evidence attached',
  'dash.deadline': 'Deadline',

  /* ---------------------------------------------------------------- entities */
  'entities.title': 'Entities',
  'entities.sub': 'Every body funded by the Department, its allocation and its reporting state.',
  'entities.total': 'Total entities',
  'entities.submitting': 'Submitting reports',
  'entities.atRisk': 'High or critical',
  'entities.atRiskSub': 'Need attention',
  'entities.nothingFiled': 'Nothing filed',
  'entities.searchPlaceholder': 'Search entities by name...',
  'entities.colEntity': 'Entity',
  'entities.colSector': 'Sector',
  'entities.colAllocation': 'Allocation',
  'entities.colRisk': 'Risk',
  'entities.colPeriod': 'This period',
  'entities.bySector': 'By sector',
  'entities.empty': 'No entity matches that filter. That is a filter with no matches rather than an empty register.',

  /* ---------------------------------------------------------------- risk screen */
  'riskScreen.title': 'Risk & Alerts',
  'riskScreen.sub': 'Where the Department should look first this quarter, and why.',
  'riskScreen.activeAlerts': 'Active alerts',
  'riskScreen.distribution': 'Distribution',
  'riskScreen.colBand': 'Band',
  'riskScreen.colFactor': 'Largest contributing factor',
  'riskScreen.colScore': 'Score',
  'riskScreen.colReporting': 'Reporting',
  'riskScreen.whyScore': 'Why this score',
  'riskScreen.reportingPeriod': 'Reporting this period',
  'riskScreen.openEntity': 'Open the entity',
  'riskScreen.reviewFiling': 'Review the filing',
  'riskScreen.selectAlert': 'Select an alert to see the signals behind it.',
  'riskScreen.noneScored':
    'No entity has been scored for this period. That is an absence of scoring rather than an absence of risk.',

  /* ---------------------------------------------------------------- review */
  'review.queue': 'Review queue',
  'review.sortedBy': 'Sorted by',
  'review.byRisk': 'risk',
  'review.byEntity': 'entity',
  'review.byDate': 'date received',
  'review.notSubmitted': 'not submitted',
  'review.approve': 'Approve',
  'review.returnWithComments': 'Return with comments',
  'review.disputeFigure': 'Dispute this figure',
  'review.markDisputed': 'Mark disputed',
  'review.disputed': 'Disputed',
  'review.noFiguresDisputed': 'No figures disputed',
  'review.returningNote':
    'Returning sends only the disputed targets back. The rest stays as filed, with the original confirmation and its author on the record.',
  'review.noEditControl':
    'There is no control on this screen that changes a reported figure, and no endpoint behind one. A figure you do not believe is disputed and returned, not edited.',

  /* ---------------------------------------------------------------- reporter */
  'reporter.downloadTemplate': 'Download template',
  'reporter.uploadFile': 'Upload completed file',
  'reporter.captureOnPhone': 'Capture on a phone',
  'reporter.openPeriod': 'Open this period',
  'reporter.priorPeriods': 'Prior periods',
  'reporter.confirm': 'Confirm',
  'reporter.confirmAll': 'Confirm {0} remaining',
  'reporter.submitToDept': 'Submit to the Department',
  'reporter.notSavedYet':
    'Nothing here is saved as a reported result yet. Confirming writes these figures in your name, and they cannot be edited afterwards.',
  'reporter.reportedFigure': 'Reported figure',
  'reporter.quarterTarget': 'Quarter target',
  'reporter.annualTarget': 'Annual target',
  'reporter.variance': 'Variance',
  'reporter.noResultThisQuarter': 'No result this quarter, because',
  'reporter.varianceReasonRequired': 'Reason for the variance (required)',
  'reporter.noteOptional': 'Note for the Department (optional)',

  /* ---------------------------------------------------------------- tasks */
  'tasks.title': 'Tasks',
  'tasks.sub': 'What is assigned to you, and what is waiting on somebody else.',
  'tasks.open': 'Open',
  'tasks.overdue': 'Overdue',
  'tasks.done': 'Done',
  'tasks.markDone': 'Mark done',
  'tasks.reopen': 'Reopen',
  'tasks.colTask': 'Task',
  'tasks.colAssignedBy': 'Assigned by',
  'tasks.colDue': 'Due',
  'tasks.noDueDate': 'no due date',
  'tasks.empty': 'Nothing is assigned to you. That is an empty queue rather than nothing to do.',

  /* ---------------------------------------------------------------- documents */
  'docs.title': 'Documents',
  'docs.sub': 'Evidence and supporting files, with their version history and proof of receipt.',
  'docs.colFile': 'File',
  'docs.colVersion': 'Version',
  'docs.colReceipt': 'Receipt',
  'docs.colDecision': 'Decision',
  'docs.colSatisfies': 'Satisfies',
  'docs.current': 'current',
  'docs.awaitingReceipt': 'awaiting receipt',
  'docs.receipted': 'Receipted',
  'docs.chooseEntity': 'Choose an entity...',
  'docs.empty': 'No documents held for this entity.',

  /* ---------------------------------------------------------------- audit */
  'audit.title': 'Audit trail',
  'audit.sub': 'Who did what, to which figure, and when.',
  'audit.eventsInRange': 'Events in range',
  'audit.from': 'From',
  'audit.to': 'To',
  'audit.kind': 'Kind',
  'audit.allKinds': 'All kinds',
  'audit.everyEntity': 'Every entity',
  'audit.colWhen': 'When',
  'audit.colWho': 'Who',
  'audit.colWhat': 'What happened',
  'audit.events': 'Events',
  'audit.empty':
    'Nothing was recorded in this range. That is an absence of activity rather than an absence of records.',
  'audit.rangeInvalid': 'The end of the range is before its start. Nothing is shown until that is fixed.',

  /* ---------------------------------------------------------------- workspaces */
  'ws.title': 'Workspaces',
  'ws.sub': 'Where each entity’s documents live, and whether the Microsoft mirror is bound.',
  'ws.entityProfile': 'Entity profile',
  'ws.msConfigured': 'Microsoft 365 is configured.',
  'ws.msNotConfigured': 'Microsoft 365 is not configured.',
  'ws.msChecking': 'Checking the Microsoft 365 binding...',

  /* ---------------------------------------------------------------- admin */
  'admin.title': 'Entities',
  'admin.publish': 'Publish',
  'admin.unpublish': 'Unpublish',
  'admin.published': 'published',
  'admin.notPublished': 'not published',
  'admin.citizenView': 'Citizen view',
  'admin.openCitizenView': 'Open the citizen view',
  'admin.publicationNote':
    'Publication is a departmental decision and this system does not make it. Nothing reaches the citizen view unless it is switched on here.',

  /* ---------------------------------------------------------------- landing */
  'land.eyebrow': 'Welcome to DSAC',
  'land.h1a': 'Arts. Culture.',
  'land.h1b': 'Heritage.',
  'land.h1c': 'Our Future.',
  'land.lede':
    'Building a creative and inclusive South Africa through the power of sport, arts, culture and heritage.',
  'land.employee': 'Login as employee',
  'land.employeeSub': 'for DSAC staff. Straight to your dashboard',
  'land.signin': 'Sign in',
  'land.signinSub': 'for reporting entities',
  'land.citizenView': 'The citizen view',
  'land.pillar.creativity': 'Creativity',
  'land.pillar.creativityBody': 'Fueling imagination and creative expression.',
  'land.pillar.heritage': 'Heritage',
  'land.pillar.heritageBody': 'Preserving our past, inspiring our future.',
  'land.pillar.sport': 'Sport',
  'land.pillar.sportBody': 'Unity, wellness and opportunity.',
  'land.pillar.culture': 'Culture',
  'land.pillar.cultureBody': 'Diverse people, stronger communities.',
  'land.quote': '“Culture is not a luxury, it is a necessity.”',

  /* ---------------------------------------------------------------- auth */
  'auth.h1a': 'Culture. Heritage.',
  'auth.h1b': 'Our Future.',
  'auth.lede':
    'The DSAC Administration Portal empowers our people, protects our heritage and advances a vibrant creative economy.',
  'signin.title': 'Welcome back.',
  'signin.sub': 'Sign in to the DSAC Administration Portal.',
  'signin.email': 'Email address',
  'signin.password': 'Password',
  'signin.passwordPlaceholder': 'Enter your password',
  'signin.remember': 'Remember me',
  'signin.forgot': 'Forgot password?',
  'signin.submit': 'Sign in',
  'signin.or': 'or',
  'signin.employee': 'Sign in as employee',
  'signin.noAccount': 'Don’t have an admin account?',
  'signin.phoneNote': 'Reporting on a phone? The low bandwidth surface, which needs no JavaScript, is at',
  'signin.citizenNote': 'The citizen view, which needs no account at all, is at',
  'signin.contact': 'Contact DSAC support',
  'signin.popia':
    'Your information is protected and handled in accordance with the Protection of Personal Information Act (POPIA).',
  'signin.emailMissing': 'Enter the email address on your account.',
  'signin.emailBad': 'That does not look like an email address.',
  'signin.passwordMissing': 'Enter your password.',
  'signin.wrong': 'That email address and password do not match an account.',
  'signin.showPassword': 'Show the password',
  'signin.hidePassword': 'Hide the password',

  'forgot.title': 'Forgot password.',
  'forgot.sub': 'Enter the address on your DSAC account.',
  'forgot.submit': 'Send the reset link',
  'forgot.sentTitle': 'Check your email',
  'forgot.again': 'Use a different address',
  'forgot.remembered': 'Remembered it?',
  'forgot.back': 'Back to sign in',

  'register.title': 'Entity Registration',
  'register.sub': 'Complete the form below to register your organisation with DSAC.',
  'register.step1': 'Organisation Details',
  'register.step2': 'Contact Details',
  'register.step3': 'Supporting Documents',
  'register.step4': 'Review & Submit',
  'register.orgInfo': 'Organisation Information',
  'register.orgName': 'Organisation Name',
  'register.regNumber': 'Registration Number (if available)',
  'register.entityType': 'Entity Type',
  'register.sector': 'Sector',
  'register.address': 'Physical Address',
  'register.province': 'Province',
  'register.postalCode': 'Postal Code',
  'register.contactNumber': 'Main Contact Number',
  'register.website': 'Website (optional)',
  'register.fullName': 'Full Name',
  'register.role': 'Role at the organisation',
  'register.workEmail': 'Work Email Address',
  'register.submitApplication': 'Submit application',
  'register.receivedTitle': 'Application received',

  /* ---------------------------------------------------------------- karabo */
  'karabo.ask': 'Ask Karabo',
  'karabo.subtitle': 'Ask about any body the Department funds',
  'karabo.placeholder': 'Ask about an entity, a figure or a deadline...',
  'karabo.trySome': 'Try one of these',
  'karabo.thinking': 'Reading the record',
  'karabo.notConnected':
    'Karabo is a design. No model is connected and no answer here is real. When it is wired it will read the same endpoints you can, so it will never tell you something your own account could not see.',

  /* Audit outcomes, as the Auditor-General publishes them. "Clean audit" is the phrase in
     general use for an unqualified opinion with no findings; the others are the formal terms
     and are not softened, because a qualified opinion is a qualified opinion in any language. */
  'outcome.clean': 'Clean audit',
  'outcome.unqualifiedFindings': 'Unqualified with findings',
  'outcome.qualified': 'Qualified',
  'outcome.adverse': 'Adverse',
  'outcome.disclaimer': 'Disclaimer',
  'outcome.outstanding': 'Audit outstanding',
  'outcome.none': 'No published outcome',

  /* The Auditor-General's seven tests, used as published. */
  'criterion.presentation': 'presentation',
  'criterion.consistency': 'consistency',
  'criterion.measurability': 'measurability',
  'criterion.relevance': 'relevance',
  'criterion.validity': 'validity',
  'criterion.accuracy': 'accuracy',
  'criterion.completeness': 'completeness',

  /* Deadline bases. The statutory ones cite the section and say so; the Treasury guideline one
     says it is a guideline. A translation that renders all seven as "the rules say" destroys the
     only distinction the screen exists to draw. */
  'basis.tr2611': 'Treasury Regulation 26.1.1, thirty days after quarter end. Financial data only.',
  'basis.tr3021':
    'Treasury Regulation 30.2.1, quarterly performance to the executive authority. The regulation sets no day count, so this date is a National Treasury guideline.',
  'basis.pfma551c': 'PFMA section 55(1)(c), statements to the auditors within two months of year end. Statutory.',
  'basis.pfma551d': 'PFMA section 55(1)(d), annual report within five months of year end. Statutory.',
  'basis.pfma651a': 'PFMA section 65(1)(a), tabling within one month of receiving the audit report. Statutory.',
  'basis.pfma652':
    'PFMA section 65(2), the six month backstop after which the executive authority must explain. Statutory.',
  'basis.departmental': 'A date the Department set. Enforceable as an instruction rather than as law.',
  'basis.unrecorded': 'The basis for this date is not recorded.',

  'sector.unassigned': 'Unassigned',
  'status.unknown': 'Unknown',
  'signal.generic': 'Signal',

  'common.unnamedFile': 'Unnamed file',
  'prov.byHand': 'Entered by hand, no source cell',
  'prov.theSheet': 'the sheet',
  'prov.download': 'Downloads the uploaded file. This value is in {0}, cell {1}.',

  'risk.badgeLabel': 'Risk score {0}, band {1}. Opens the five signals behind it.',
  'risk.notScoredLabel': 'Not yet scored for this period.',
  'risk.movement': 'Change since the previous period',
  'risk.closeExplain': 'Close the risk explanation',
  'risk.computedAt': 'Computed {0}',
  'risk.computedFrom': 'Computed from the signals stored for this reporting period.',
  'risk.noDescription': 'No description was stored for this signal.',

  'comment.loading': 'Loading the conversation.',
  'comment.unknown': 'Unknown',
  'comment.closed': 'Closed.',
  'comment.reply': 'Reply',
  'comment.send': 'Send reply',
  'comment.sending': 'Sending',

  'period.confirmed': 'Targets with a confirmed result',

  'evidence.storeError':
    '{0} files on record. Could not read the document store, so they cannot be opened here.',
  'risk.notStored': 'not stored',
  'period.loadFailed': 'Could not load the reporting period.',
  'period.contactReviewer': 'Contact your DSAC reviewer if you expected one to be open.',
  'period.reportedOf': '{0} of {1} targets reported',

  'state.unknown': 'State unknown.',
  'state.unreadable': 'The workflow state could not be read.',
  'state.nullReporter':
    'No submission has been opened for this period. Next: download the template, or capture on a phone.',
  'state.nullReviewer':
    'Nothing has been opened for this period. Nobody at the Department can act until it arrives.',
  'state.draftUnknown': 'Next: upload or capture, then confirm each figure.',
  'state.draftReady': 'Next: submit the period to the Department.',
  'state.draftLeft': 'Next: {0} figures still to confirm before you can submit.',
  'state.draftOneLeft': 'Next: 1 figure still to confirm before you can submit.',
  'state.draftReviewer': 'This is a draft. The Department cannot see figures until the entity submits.',
  'state.submittedReporter':
    'You will be notified if any figure is returned to you. Evidence may still be attached.',
  'state.submittedReviewer':
    'Next: verify each figure against its source, then approve or return with comments.',
  'state.reviewReporter': 'A reviewer has it open. You will be notified if any figure is returned.',
  'state.reviewReviewer': 'Next: approve, or dispute specific targets and return the submission.',
  'state.returnedWithReason':
    'Next: correct only the disputed figures and confirm again. Reason given: {0}',
  'state.returnedNoReason':
    'Next: correct only the disputed figures and confirm again. The disputed targets are marked below.',
  'state.returnedReviewer': 'Returned with comments. Only the disputed targets were reopened.',
  'state.approvedReporter':
    'Approved by the Department. The figures stay on the record as filed and cannot be edited.',
  'state.approvedReviewer':
    'Approved and recorded against the reviewer who approved it. Approval does not make the figures editable.',

  'comment.title': 'Comments on these figures',
  'comment.empty':
    'Nothing has been said about these figures. A dispute raised by the Department appears here, and against the figure itself, without reloading the page.',
  'comment.roleEntity': 'entity',
  'comment.roleReviewer': 'DSAC review',
  'comment.roleExecutive': 'DSAC',
  'comment.roleAdmin': 'administrator',

  'ind.sourceNotOpenable': 'Source file not openable here.',
  'ind.deliveryAgainstAnnual': 'Delivery against annual',
  'ind.noResultThisQuarter': 'No result this quarter.',
  'ind.confirmedBy': 'Confirmed by {0}',
  'ind.anOfficial': 'an official at the entity',
  'ind.you': 'you',
  'ind.reopened': 'Reopened for correction',
  'ind.confirmed': 'Confirmed',
  'ind.disputed': 'Disputed',
  'ind.deptDisputed': 'The Department disputed this figure.',
  'ind.noComment': 'No comment was recorded.',
  'ind.noResult': 'No result',
  'ind.notParsedShort': 'Not parsed',
  'ind.notANumber': 'Not a number.',
  'ind.readsCell': 'Cell {0}',
  'ind.readsFile': 'The file',
  'ind.enterAsNumber': 'Enter the figure as a number, or record that there is no result this quarter.',
  'ind.notParsed': 'Not parsed.',
  'ind.cellUnreadable': 'Cell {0} could not be read as a number.',
  'ind.noValueFound': 'No value for this indicator was found in the uploaded file.',
  'ind.noFileUploaded': 'No file has been uploaded for this period.',
  'ind.enterItHere': 'Enter it here, or record that there is no result this quarter.',
  'ind.reportedFigure': 'Reported figure',
  'ind.varianceNeedsReason':
    'A variance past {0} percent needs a reason before you can confirm. Giving it now avoids the submission being returned, which costs about two weeks.',
  'ind.noResultBecause': 'No result this quarter, because',
  'ind.noResultReasonLabel': 'Reason there is no result this quarter',
  'ind.lockedNote':
    'This figure cannot be edited. A reviewer who disputes it returns the submission.',
  'ind.recordNoResult': 'Record no result',
  'ind.confirmValue': 'Confirm {0}',
  'ind.noResultReasonGiven': 'No result, reason given.',
  'ind.noResultReasonShort': 'No result, reason given',
  'ind.entitySaid': 'The entity said: ',
  'ind.disputeReason': 'Reason. The entity sees this against this target only',

  'chain.label': 'The accountability chain for this entity',
  'chain.allocated': 'Allocated',
  'chain.promised': 'Promised',
  'chain.reported': 'Reported',
  'chain.verified': 'Verified',
  'chain.targets': '{0} targets',
  'chain.oneTarget': '1 target',
  'chain.countOf': '{0} of {1}',
  'chain.noAllocation': 'No allocation row for the current financial year.',
  'chain.noTargets':
    'No targets registered for the year. An administrator loads these from the tabled Annual Performance Plan.',
  'chain.nothingReported': 'Nothing reported for this period yet.',
  'chain.noEvidence': 'No evidence attached to any reported figure.',
  'chain.storeUnreadable': 'Could not read the document store.',

  'karabo.greeting':
    'I am Karabo. Ask me about any body the Department funds, in ordinary words, and I will answer with the figure and where it came from.',
  'karabo.disclaimer':
    'I am not connected yet, so I cannot answer for real. Everything I will answer from is already in the system: allocations, targets, what was reported, what evidence is attached and who confirmed it. Try a question and I will tell you what I would read.',
  'karabo.q1': 'Which entities are late this quarter?',
  'karabo.q2': 'What was Iziko allocated this year?',
  'karabo.q3': 'Why is Robben Island scored critical?',
  'karabo.q4': 'Show me figures with no evidence attached',
  'karabo.aLate':
    'I would answer this from the submission lateness signal on each entity, which stores the days late and which deadline it measured against. That distinction matters: a departmental instruction and a statutory PFMA date are not the same breach.',
  'karabo.sLate': 'Would read: risk signals, reporting periods and their deadline basis',
  'karabo.aMoney':
    'I would give you the figure and the line it came from, which for allocations is Estimates of National Expenditure 2026, Vote 37, Table 37.3. An entity with no allocation row would come back as having none rather than as zero.',
  'karabo.sMoney': 'Would read: allocations for the current financial year',
  'karabo.aRisk':
    'I would read the five stored signals behind the score and give you them with their weights and contributions, in the same words the risk panel uses. The score is arithmetic rather than a prediction, so I can show you how it was reached rather than asking you to trust it.',
  'karabo.sRisk': 'Would read: the stored risk score and its signals for that period',
  'karabo.aEvidence':
    'I would list the reported figures with no document attached. Those show to the Department as unverifiable, which is the Auditor-General\u2019s word and a different thing from unverified.',
  'karabo.sEvidence': 'Would read: target results and the documents attached to each',
  'karabo.aFallback':
    'Once I am connected I would answer that from the reporting record and show you where the figure came from. For now the same answer is on the screens themselves: the portfolio for who is at risk, an entity page for its allocation and targets, and the audit trail for who did what.',
  'karabo.sFallback': 'Not connected. No figure has been invented for this reply',

  'tasks.what': 'your tasks',
  'tasks.notUpdated': 'The task was not updated.',
  'tasks.openSub': 'Assigned to you',
  'tasks.overdueSub': 'Past the due date',
  'tasks.doneSub': 'Closed by you',
  'tasks.noneInView': 'No tasks in this view.',
  'tasks.untitled': 'Untitled task',
  'tasks.external': 'external',
  'tasks.colStatus': 'Status',

  'an.subtitle': 'Not built, and the reason is worth reading.',
  'an.noData': 'There is no data behind this screen yet.',
  'an.body1':
    'The design for Analytics & Insights shows a performance trend by month, an on-track rate by sector, a quarter-on-quarter comparison, and document view and download counts. None of those exist in the schema. Performance is stored per reporting period against a target, not per month; there is no sector rate; and nothing counts a view or a download.',
  'an.body2':
    "Every figure on that mockup would therefore have to be invented. This product's whole claim is that a reported number carries the cell it came from and the person who confirmed it, so a screen of plausible trends would be the most persuasive thing in the build and the only part that could not survive being clicked into.",
  'an.whatItTakes': 'What it would take',
  'an.trendHead': 'Trend over time.',
  'an.trendBody':
    'Scores and results are already stored per reporting period, so a quarter-by-quarter series is real and buildable today. A monthly one is not, and would stay unavailable.',
  'an.sectorHead': 'Sector comparison.',
  'an.sectorBody':
    'Targets achieved against targets set, grouped by sector, is computable from data already held. Worth doing, and honest.',
  'an.docsHead': 'Document analytics.',
  'an.docsBody':
    'Needs an access log that does not exist. It is also the least valuable of the three and carries a POPIA question, because a log of who read what is personal information where the other reporting data is not.',
  'an.goRisk': 'Risk & Alerts, which is real',

  'admin.what': 'the entity register',
  'admin.flagNotChanged': 'The publication flag was not changed.',
  'admin.publishedCount': '{0} of {1} published to the citizen view',
  'admin.colTargets': 'Targets',
  'admin.noneRegistered': 'none registered',
  'admin.noEntities':
    'No entities are registered. Seeding loads the funded bodies from published Estimates of National Expenditure figures on first start.',
  'admin.publicationNoteLong':
    'Publication is a departmental decision and this system does not make it. Nothing reaches the citizen view unless it is switched on here, every seeded entity ships with it off, and every change is written to the audit log with the actor on it.',

  'ws.what': 'workspaces',
  'ws.yourEntity': 'Your entity',
  'ws.searchLabel': 'Search workspaces by entity name',
  'ws.searchPlaceholder': 'Search workspaces...',
  'ws.msNotReported': 'Microsoft 365 status is not reported by this build.',
  'ws.noMatch': 'No entity matches that search.',
  'ws.noEntityId':
    'This account carries no entity id, so it has no workspace. An administrator sets the entityId claim on a reporter account.',
  'ws.designNote':
    'The design for this screen shows workspace templates, member counts and last-accessed times. A workspace here is the binding between an entity and where its documents live, and the schema records no membership, no template and no access time, so {0} are shown as what they actually are.',
  'ws.oneWorkspace': '1 workspace is',
  'ws.nWorkspaces': '{0} workspaces are',

  'docs.what': 'documents',
  'docs.notYours': 'No such entity, or it is not yours to read.',
  'docs.allVersions': 'All versions on record',
  'docs.currentVersions': 'Current versions',
  'docs.supersededStay': 'Superseded ones stay on record',
  'docs.receiptedSub': 'The Department acknowledges holding these',
  'docs.approved': 'Approved',
  'docs.decidedBy': 'Decided by a named official',
  'docs.files': 'Files',
  'docs.returned': 'returned',
  'docs.pending': 'pending',
  'docs.by': 'by {0}',
  'docs.notStated': 'not stated',
  'docs.criterionNote':
    "A document is offered against one of the Auditor-General's tests, which is what makes this a readiness tool rather than a folder. Where the criterion reads \u201cnot stated\u201d the uploader did not say, and that is itself worth a reviewer's attention.",

  'entities.what': 'the entity register',
  'entities.noOpenPeriod': 'no open period',
  'entities.searchLabel': 'Search entities by name',
  'entities.count': 'Entities ({0})',
  'entities.noRow': 'no row',
  'entities.confirmedOf': '{0} of {1}',
  'entities.designNote':
    'The design for this screen also carries an acronym, a province and a registration number. None of the three exists in the schema, so they are absent here rather than filled in. Allocations are the published medium term estimates from Estimates of National Expenditure 2026, Vote 37, Table 37.3.',
  'entities.publicationHead': 'Publication is a departmental decision',
  'entities.publicationBody':
    'Nothing reaches the citizen view unless an administrator switches it on, and every seeded entity ships with it off. The switch is on the Settings screen.',

  'ws.bindingNote':
    'A bound workspace mirrors documents to SharePoint and sends the deadline countdown to Teams. Without a tenant, documents are still held here with their versions and receipts, and nothing about the evidence chain depends on the mirror.',
  'docs.chooseNote':
    'Choose an entity to see the documents held for it. A reporter sees their own entity automatically, because the entity comes off the signed token rather than from a dropdown.',

  'riskScreen.what': 'risk scores',
  'riskScreen.whatScores': 'scores',
  'riskScreen.criticalSub': 'Score of 70 or above',
  'riskScreen.highSub': '50 to 69',
  'riskScreen.mediumSub': '25 to 49',
  'riskScreen.lowSub': 'Below 25',
  'riskScreen.filterCount': '{0} ({1})',
  'riskScreen.emptyBand': 'Nothing in that band for this period.',
  'riskScreen.view': 'View',
  'riskScreen.notSubmitted': 'not submitted',
  'riskScreen.methodNote':
    'Weights are fixed and published. Bands: 25 medium, 50 high, 70 critical. Every score here is arithmetic, not a prediction, and can be reproduced by hand from the signals behind it. The design for this screen carried an alerts trend line and a predicted impact figure; neither is shown, because nothing stores a score per day and the engine does not forecast.',
  'riskScreen.bandRisk': '{0} risk',
  'riskScreen.noAllocationRow': 'No allocation row',
  'riskScreen.allocatedThisYear': '{0} allocated this year',
  'riskScreen.noDescriptionStored': 'No description stored.',
  'riskScreen.reportingLine': '{0}, {1} of {2} targets confirmed, {3}.',
  'riskScreen.evidenceDocs': '{0} evidence documents',
  'riskScreen.noEvidenceAttached': 'no evidence attached',
  'riskScreen.nothingFiled': 'Nothing has been filed for this period.',
  'entities.noneRegistered': 'No entities registered.',

  'review.what': 'the queue',
  'review.noOpenPeriod': 'No open reporting period',
  'review.counts': '{0} entities, {1} submitted, {2} outstanding, {3} returned',
  'review.sortNote': 'Available, and not the default. Risk order is what makes the queue readable.',
  'review.noEntities': 'No entities are registered. This is an empty register rather than a clean portfolio.',
  'review.more': '{0} more',
  'review.showAll': 'show all',
  'review.subsUnreadable': 'The queue is ranked, but the submission states could not be read. ',
  'review.largestFactor': 'Largest factor:',
  'review.notScoredRecompute': 'Not yet scored for this period. Recompute to score it.',
  'review.factorNoneMaterial': 'Largest factor: none material.',
  'review.metaReported': '{0} of {1} targets reported',
  'review.metaEvidence': ', {0} evidence documents',
  'review.metaNoEvidence': ', no evidence attached',
  'review.metaDaysLate': ', submitted {0} days late',
  'review.metaOneDayLate': ', submitted 1 day late',
  'review.nothingOpened': 'Nothing has been opened for this period.',
  'review.open': 'open',
  'review.seeEntity': 'see the entity',

  'upload.what': 'this period',
  'upload.unreadable':
    'The file could not be read. Check that it is the template downloaded from this period.',
  'upload.title': 'Upload the completed template',
  'upload.nothingWritten': 'Nothing is written as a reported result.',
  'upload.nothingWrittenBody':
    'You confirm each figure on the next screen, and only a confirmed figure is filed in your name.',
  'upload.fileLabel': 'The completed .xlsx template',
  'upload.reading': 'Reading the file',
  'upload.parse': 'Upload and parse',
  'upload.lastRead': 'Last file read: {0}',
  'upload.unnamed': 'unnamed',
  'upload.oneRow': 'One row',
  'upload.nRows': '{0} rows',
  'upload.unmatched': '{0} carried an indicator code that matches no registered target.',

  'upload.targetsRegistered': '{0}. {1} targets registered for the year.',
  'upload.readsNote': 'Uploading reads the file and records what each value was and which cell it came from.',
  'upload.confirmNext': 'You confirm each figure on the next screen, and that is the step that files it in your name.',
  'upload.help':
    'Use the template downloaded from this period. It is pre filled with your registered targets and their indicator codes, so the parser can match each row. A blank spreadsheet with retyped indicator names is the most common reason an upload cannot be matched.',
  'upload.parserHint':
    'The parser expects the sheet and header row shipped in the template. Download it again from your entity home rather than rebuilding it by hand.',
  'upload.rowsRead': '{0} rows read. {1} matched a registered target.',
  'upload.heldAside':
    'They are held aside and shown on the next screen rather than dropped, because a silently discarded row is how a target goes unreported.',
  'upload.notPerformanceYet': 'None of this is performance data yet.',
  'upload.reviewRead': 'Review what was read',

  'uc.title': 'Unit cost',
  'uc.whatEntity': 'this entity',
  'uc.whatFigures': 'the unit cost figures',
  'uc.whatPeers': 'the peer comparison',
  'uc.nothingToCompare':
    'No indicator for this entity carries both a planned unit cost and a reported spend, so there is nothing to compare. A unit cost with only one side of the division is not a unit cost, and it is left absent rather than estimated.',
  'uc.indicator': 'Indicator',
  'uc.againstPlan': 'Against its own plan',
  'uc.planned': 'Planned',
  'uc.actual': 'Actual',
  'uc.over': 'over',
  'uc.units': 'units',
  'uc.noApportionedSpend': 'no apportioned spend',
  'uc.noPlannedVolume': 'no planned volume',
  'uc.noReportedSpend': 'no reported spend',
  'uc.noReportedDelivery': 'no reported delivery',
  'uc.notComputable': 'not computable',
  'uc.perUnit': 'per unit',
  'uc.workingShown':
    'The numerator and the denominator are both shown. A unit cost with its working hidden is a number nobody can check, and this product does not put those on a screen.',
  'uc.againstHistory': 'Against its own history',
  'uc.noPriorYear':
    'No prior year unit cost on record for this indicator. A single year is not a trend and is not presented as one.',
  'uc.noFigure': 'no figure',
  'uc.per': 'per {0}',
  'uc.againstPeers': 'Against sector peers',
  'uc.noPeerComparison': 'No peer comparison is available for this entity.',
  'uc.noPeerGroup':
    'No comparable entity in the {0} sector carries a reported unit cost, so there is no peer group. A median of one is not a median, and the comparison is withheld rather than drawn from a single other body.',
  'uc.peerLine': '{0} sector, {1} comparable {2}',
  'uc.entityWord': 'entity',
  'uc.entitiesWord': 'entities',
  'uc.thisEntity': 'This entity',
  'uc.peerMedian': 'Peer median',
  'uc.noReportedUnitCost': 'no reported unit cost',
  'uc.absentHead': 'The comparison this system does not offer',
  'uc.ownSector': "entity's own",
  'uc.absentBody':
    'Comparison is within the {0} sector only. There is no view that compares cost per outcome across sectors, because a library item and a boxing licence are not commensurable outputs. The system does not offer that comparison and there is no API parameter that produces it.',
  'uc.absentNote':
    'The restriction is built into the endpoint rather than into a guideline. That is the difference between a decision and a warning label.',

  'home.reportingAs':
    'Reporting as {0}. The entity is taken from your signed token, which is why there is nothing here to choose.',
  'home.templateTitle':
    'An .xlsx carrying your registered targets, their indicator codes and their annual targets, with the actuals column empty',
  'home.templateFailed': 'The template could not be downloaded.',
  'home.phoneTitle': 'One indicator per screen, server rendered, under 5KB',
  'home.returned': 'The Department returned this period.',
  'home.noOverallReason':
    'No overall reason was recorded. The disputed targets are marked on the review screen.',
  'home.onlyDisputed':
    'Only the disputed targets were reopened. Everything else stays as filed, with the original confirmation and its author on the record.',
  'home.correctDisputed': 'Correct the disputed figures',
  'home.latenessNote': 'The lateness signal in your risk score is computed from these rows and nothing else.',
  'home.whatHistory': 'your reporting history',
  'home.noPrior':
    'No prior periods on record for this entity. That is an absence of history rather than a clean history, and the risk engine treats it that way.',
  'home.reportedOf': '{0} of {1} reported',
  'home.submittedOn': 'submitted {0}',
  'home.submittedDaysLate': 'submitted {0} days late',
  'home.submittedOneDayLate': 'submitted 1 day late',
  'home.submittedOnTime': 'submitted on time',
  'home.neverSubmitted': 'never submitted',
  'home.deadlineNote':
    '{0} on {1}. The Department is notified at thirty days, at fifteen days and hourly in the final day, so a late submission is visible to them before it is late.',
  'home.targetsLabel': 'Targets registered for the year',
  'home.targetsSub': 'Loaded from your tabled Annual Performance Plan',
  'home.confirmedLabel': 'Figures confirmed this period',
  'home.confirmedSub': 'Written in your name, and not editable afterwards',
  'home.evidenceLabel': 'Evidence documents attached',
  'home.evidenceSub': 'A figure with none shows as unverifiable',
  'home.downloadTemplate': 'Download template',
  'home.uploadFile': 'Upload completed file',
  'home.captureOnPhone': 'Capture on a phone',

  'dd.portfolio': 'portfolio',
  'dd.sectorLine': '{0} sector',
  'dd.chain': 'The chain',
  'dd.trajectory': 'Trajectory',
  'dd.trajectorySub': 'Allocation by financial year, in rands.',
  'dd.whatAllocations': 'the allocation history',
  'dd.noAllocations':
    'No allocation rows for this entity. That is an absent figure rather than a zero allocation, and it is left absent rather than filled in.',
  'dd.auditHistory': 'Audit history',
  'dd.noAuditOutcome':
    'No published audit outcome could be reached for this entity. The risk engine treats an absent row as absence of evidence rather than as a clean audit, and the row stays empty rather than being filled from an assumption.',
  'dd.yearNotRecorded': 'year not recorded',
  'dd.repeatFinding': 'repeat finding',
  'dd.noDescriptionOnRecord': 'No description on the record.',
  'dd.outstanding': 'Outstanding',
  'dd.whatOutstanding': 'what is outstanding',
  'dd.noResultCountUnreadable': 'The count of targets with no result could not be read.',
  'dd.targetsNoResult': '{0} targets with no result for the open period',
  'dd.oneTargetNoResult': '1 target with no result for the open period',
  'dd.noEvidenceCountUnreadable': 'The count of figures with no evidence could not be read.',
  'dd.figuresNoEvidence':
    '{0} reported figures with no evidence attached, which the Department sees as unverifiable',
  'dd.oneFigureNoEvidence':
    '1 reported figure with no evidence attached, which the Department sees as unverifiable',
  'dd.targetsForYear': 'Targets for the year',
  'dd.haveResult': '{0} of {1} have a result on record',
  'dd.noTargets':
    "No targets registered for the current financial year. An administrator loads these from the entity's tabled Annual Performance Plan.",
  'dd.colDelivered': 'Delivered',
  'dd.totalAllocation': 'Total allocation on record for the current financial year: {0}',
  'dd.readOnlyByDesign':
    '. This view is read only by design: an executive role cannot touch the data at all.',
  'dd.scoreUnreadable': 'The stored score could not be read.',

  'sr.notReturned': 'The submission was not returned.',
  'sr.notApproved': 'The approval was not recorded.',
  'sr.replyNotSent': 'The reply was not sent.',
  'sr.title': 'Submission',
  'sr.queue': 'queue',
  'sr.submittedBy': 'Submitted {0} by {1}',
  'sr.daysAfterDue': ', {0} days after the due date of {1}',
  'sr.oneDayAfterDue': ', 1 day after the due date of {0}',
  'sr.daysBeforeDue': ', {0} days before the due date',
  'sr.oneDayBeforeDue': ', 1 day before the due date',
  'sr.notSubmitted': 'Not submitted. Nothing has been filed for this period.',
  'sr.verifiable': '{0} of {1} verifiable',
  'sr.noEvidenceCount': ', {0} reported figures with no evidence',
  'sr.lastReviewedBy': 'Last reviewed by {0}',
  'sr.noTargets':
    'No targets are registered for this entity for the current financial year, so there is nothing filed to verify.',
  'sr.figuresDisputed': '{0} figures disputed',
  'sr.oneFigureDisputed': '1 figure disputed',
  'sr.exportProvenance': 'Export with provenance',
  'sr.draftNote': 'The entity has not submitted this period yet. Approve and return open once they do.',
  'sr.returnTitle': 'Return this submission',
  'sr.returnN': 'Return {0} figures',
  'sr.returnOne': 'Return 1 figure',
  'sr.returnBody':
    'The entity sees each comment against the specific target it belongs to, not as one note about the whole submission. Only the disputed targets are reopened.',
  'sr.overallNote': 'An overall note, if one helps (optional)',
  'sr.recordedAgainstYou': 'This action is recorded against your name and the time.',
  'sr.approveTitle': 'Approve this submission',
  'sr.approveBodyA': 'Approval is recorded against ',
  'sr.approveYourName': 'your name',
  'sr.approveBodyB':
    ' and the time, for this submission only. It does not make any figure editable by anyone, including you.',
  'sr.noEvidenceWarn':
    '{0} reported figures have no evidence attached and will stay on the record as unverifiable. Approving does not change that, and the export carries it.',
  'sr.oneNoEvidenceWarn':
    '1 reported figure has no evidence attached and will stay on the record as unverifiable. Approving does not change that, and the export carries it.',

  'pf.title': 'Portfolio',
  'pf.sub': 'How many, then which ones, then why. Read only: nothing on this screen changes a figure.',
  'pf.what': 'the portfolio',
  'pf.allocatedThisYear': 'Allocated this year',
  'pf.noAllocationRows': '{0} bodies carry no allocation row',
  'pf.voteCitation': 'Vote 37, Table 37.3',
  'pf.fundedBodies': 'Funded bodies',
  'pf.fundedBodiesSub': 'Every body receiving an entity transfer',
  'pf.submittedQuarter': 'Submitted this quarter',
  'pf.targetsReported': 'Targets reported',
  'pf.targetsReportedSub': 'Against targets registered for the year',
  'pf.outstanding': 'Outstanding submissions',
  'pf.outstandingSub': 'Nothing filed for the open period',
  'pf.criticalSub': 'Score of 70 or above',
  'pf.bySector': 'By sector',
  'pf.all': 'all',
  'pf.noEntitiesInSector':
    'No entities in this sector. That is a filter with no matches rather than an empty portfolio.',
  'pf.byRiskBand': 'By risk band',
  'pf.greyscaleNote':
    'Every band shows its score and its word as well as its colour, because a briefing note goes out in greyscale. Click any name for the figures behind its score.',
  'pf.notScored': 'not scored',
  'pf.why': 'why',
  'pf.noneCritical': 'No entity is in the critical band for this period.',
  'pf.criticalCount': '{0} entities sit in the critical band.',
  'pf.oneCritical': '1 entity sits in the critical band.',
  'pf.noAllocationForCritical':
    'None of them carries an allocation row, so the rand figure is not available rather than zero.',
  'pf.criticalMoney': '{0} sits with entities in the critical band.',
  'pf.criticalMoneyOne': '{0} sits with the entity in the critical band.',
  'pf.clickForFigures': 'Click any name for the figures behind its score.',
  'pf.subsUnreadable': 'The bands are shown, but submission counts could not be read. ',
  'pf.countOf': '{0} of {1}',

  'er.title': 'Reviewing parsed figures',
  'er.notWritten': 'The figures were not written.',
  'er.notSubmitted': 'The period was not submitted.',
  'er.reviewingFile': 'Reviewing parsed file: {0}',
  'er.unnamedUpload': 'unnamed upload',
  'er.noFileParsed':
    'No file has been parsed for this period. Figures entered here are marked as entered by hand.',
  'er.confirmedOf': '{0} of {1} confirmed',
  'er.withEvidence': '{0} with evidence',
  'er.warning':
    'Nothing here is saved as a reported result yet. Confirming writes these figures in your name, and they cannot be edited afterwards. A correction happens by the Department returning the submission.',
  'er.returnedForCorrection': '{0} figures were returned for correction.',
  'er.oneReturnedForCorrection': '1 figure was returned for correction.',
  'er.restStaysFiled': 'Everything else stays as filed.',
  'er.showingWhole': 'Showing the whole filing.',
  'er.showAll': 'Show all {0} figures',
  'er.showReturned': 'Show only what was returned',
  'er.noTargets':
    'No targets are registered for this entity for the current financial year, so there is nothing to report against. An administrator loads targets from the tabled Annual Performance Plan. This is an empty register rather than an empty result set.',
  'er.heldAside': 'Held aside',
  'er.heldAsideBody':
    '{0} rows in the uploaded file carry an indicator code that matches no target registered for this year. They are not reportable against anything, and they are shown here rather than discarded because a silently dropped row is how a target goes unreported.',
  'er.noCode': 'no code',
  'er.noValue': 'no value',
  'er.noSourceCell': 'no source cell',
  'er.bulkTitle': 'Writes every row that has a figure and, where the variance is large, a reason',
  'er.confirmRemaining': 'Confirm {0} remaining',
  'er.submitToDept': 'Submit to the Department',
  'er.everyTargetNeeds':
    'Every target needs either a confirmed result or a recorded reason for having none before the period can be submitted.',
  'er.oneRowNeeds': 'One row still needs',
  'er.nRowsNeed': '{0} rows still need',
  'er.needsWhat':
    ' a figure, a reason for a shortfall past twenty percent, or a reason for having no result.',
  'er.goToFirst': 'Go to the first one',
  'er.confirmOne': 'Confirm this figure',
  'er.confirmN': 'Confirm {0} figures',
  'er.notYet': 'Not yet',
  'er.confirmBodyA': 'Confirming writes ',
  'er.thisFigure': 'this figure',
  'er.theseFigures': 'these figures',
  'er.confirmBodyB': " as this entity's reported results, ",
  'er.inYourName': 'in your name',
  'er.confirmBodyC': ', and ',
  'er.cannotBeEdited': 'they cannot be edited afterwards',
  'er.confirmBodyD':
    '. Corrections happen by a reviewer returning the submission, and the original row and its author stay on the record.',
  'er.noResultShort': 'no result',
  'er.fromCell': 'from {0}',
  'er.enteredByHand': 'entered by hand',
  'er.reasonGiven': 'reason given',
  'er.unverifiableNote':
    'Figures with no evidence attached will show to the Department as unverifiable, which is different from unverified. Evidence may still be attached after confirming.',
  'er.submitTitle': 'Submit {0} to the Department',
  'er.summaryTargets': 'targets',
  'er.summaryConfirmed': 'with a confirmed result',
  'er.summaryNoResult': 'recorded as having no result, with reasons',
  'er.summaryEvidence': 'with evidence attached',
  'er.summaryNoEvidence': 'with no evidence, which the Department will see as unverifiable',
  'er.submittingToday': 'Submitting today, {0} days before the due date.',
  'er.submittingTodayOne': 'Submitting today, 1 day before the due date.',
  'er.submittingLate':
    'Submitting after the due date. The lateness is recorded rather than blocked, because a system that refuses late submissions produces no data at all.',
  'er.afterThis':
    'After this the Department holds it. You will be notified if any figure is returned to you.',
  'er.docNotStored': 'The document was not stored.',
  'er.attachTitle': 'Attach evidence',
  'er.attach': 'Attach',
  'er.reliabilityNote':
    "The test being satisfied is the Auditor-General's reliability test: can this reported figure be traced back to a source document. An attendance register, a signed report, a photograph or an invoice all satisfy it. A figure with nothing attached is unverifiable, which is worse than unverified.",
  'er.theDocument': 'The document',
  'er.whichPart': 'Which part of the reliability test it satisfies',
  'er.validity': 'Validity. The reported figure actually occurred and relates to this entity.',
  'er.accuracy': 'Accuracy. The amounts and quantities are recorded correctly.',
  'er.completeness': 'Completeness. Everything that should have been recorded was.',
  'er.afterSubmission':
    'Evidence may be attached after submission. Withholding it is worse than attaching it late.',

  'audit.what': 'the audit trail',
  'audit.exportFailed': 'The export could not be generated.',
  'audit.rangeSub': '{0} to {1}',
  'audit.figuresConfirmed': 'Figures confirmed',
  'audit.figuresConfirmedSub': "Each in a named person's name",
  'audit.filings': 'Filings and reviews',
  'audit.filingsSub': 'Submitted or decided',
  'audit.documentEvents': 'Document events',
  'audit.documentEventsSub': 'Uploaded, receipted, decided',
  'audit.searchLabel': 'Search the events shown',
  'audit.searchPlaceholder': 'Actor, entity, indicator...',
  'audit.eventCount': '{0} events',
  'audit.oneEvent': '1 event',
  'audit.ofInRange': ' of {0} in range',
  'audit.noSearchMatch': 'No event matches that search.',
  'audit.notRecorded': 'Not recorded',
  'audit.footNote':
    'Times are South African Standard Time. Each line is read from the record it describes rather than from a separate log, so the trail and the data cannot disagree. This is the accountability record and not the application log: server diagnostics carry stack traces and internal paths, are written for whoever operates the service, and are not evidence of who did what.',
  'audit.kindFigureConfirmed': 'Figure confirmed',
  'audit.kindPeriodOpened': 'Period opened',
  'audit.kindSubmitted': 'Submitted',
  'audit.kindReviewed': 'Reviewed',
  'audit.kindDocUploaded': 'Document uploaded',
  'audit.kindReceipt': 'Receipt issued',
  'audit.kindDocDecided': 'Document decided',
  'audit.kindComment': 'Comment',
  'audit.kindCommentResolved': 'Comment resolved',

  'dash.greetingNamed': '{0}, {1}',
  'dash.whatSubmissions': 'submissions',
  'dash.whatReporting': 'your reporting',
  'dash.openQueue': 'Open the review queue',
  'dash.nothingFiled':
    'Nothing has been filed yet. That is an empty register rather than a portfolio with nothing outstanding.',
  'dash.colPeriod': 'Period',
  'dash.colReported': 'Reported',
  'dash.colSubmitted': 'Submitted',
  'dash.reportedOf': '{0} of {1}',
  'dash.daysLate': '{0}d late',
  'dash.reportQuarter': 'Report this quarter',
  'dash.reportQuarterSub': 'Download the template, upload, confirm',
  'dash.workQueue': 'Work the review queue',
  'dash.workQueueSub': 'Ranked by risk, not by date received',
  'dash.browseEntities': 'Browse entities',
  'dash.browseEntitiesSub': 'Every funded body and what it was allocated',
  'dash.openCitizen': 'Open the citizen view',
  'dash.openCitizenSub': 'What the public can see, no login',
  'dash.dueOn': 'Due {0}',
  'dash.statutoryPfma': 'A statutory date under the PFMA.',
  'dash.notStatutoryPfma':
    'Not a statutory date. It rests on a departmental instruction rather than on a regulation.',
  'dash.fundedBodiesSub2': 'Receiving an entity transfer',
  'dash.outstandingSub2': 'Nothing filed this period',
  'dash.criticalSub2': 'Score of 70 or above',
  'dash.allocatedSub': 'Vote 37, Table 37.3',
  'dash.targetsThisYear': 'Targets this year',
  'dash.targetsThisYearSub': 'From your tabled plan',
  'dash.confirmedSub2': 'In your name, not editable',
  'dash.evidenceSub2': 'A figure with none is unverifiable',

  'register.progress': 'Registration progress',
  'register.headline1': 'Entity',
  'register.headline2': 'Registration',
  'register.headlineEm': 'Build a stronger creative future.',
  'register.lede':
    'Register your organisation with the Department of Sport, Arts and Culture and become part of a thriving creative and cultural sector.',
  'register.feature1': 'Access opportunities',
  'register.feature2': 'Government support & funding',
  'register.feature3': 'Grow your impact',
  'register.feature4': 'Connect with the sector',
  'register.receivedBody':
    'The Department will confirm the organisation you act for before issuing an account. You will be contacted on the address you gave.',
  'register.receivedNote':
    'Nothing was actually submitted: this screen is a design and there is no onboarding endpoint behind it yet. In the built system the account and the entity it is bound to are issued together by an administrator.',
  'register.backToSignIn': 'Back to sign in',
  'register.designHead': 'This screen is a design.',
  'register.designBody':
    'Nothing is submitted. It applies to be onboarded rather than creating an account, because the entity a reporter may report for is a claim on their token: if a person chose it themselves, they could choose whose data they reach.',
  'register.selectEntityType': 'Select entity type',
  'register.selectSector': 'Select sector',
  'register.selectProvince': 'Select province',
  'register.phOrganisation': 'Enter organisation name',
  'register.phRegNumber': 'e.g. 2015/123456/08',
  'register.phAddress': 'Enter physical address',
  'register.phPostalCode': 'Enter postal code',
  'register.phContactNumber': 'e.g. 012 345 6789',
  'register.phWebsite': 'https://www.yourorganisation.org.za',
  'register.phFullName': 'Enter full name',
  'register.phRole': 'e.g. Finance officer',
  'register.phWorkEmail': 'name@yourorganisation.org.za',
  'register.phMobile': 'e.g. 082 123 4567',
  'register.contactNumberLabel': 'Contact Number',
  'register.noPasswordHere':
    'No password is chosen here. One is set when the Department issues the account, and the entity it is bound to is set with it.',
  'register.doc1': 'Registration certificate',
  'register.doc2': 'Founding document or constitution',
  'register.doc3': 'Latest audited financial statements',
  'register.doc4': 'Proof of banking details',
  'register.docHint': 'PDF, up to 15MB',
  'register.chooseFile': 'Choose file',
  'register.uploadDisabled':
    'Upload is disabled on this screen. There is no onboarding endpoint yet, and a control that accepts a file and drops it would be worse than one that does not pretend.',
  'register.reviewOrganisation': 'Organisation',
  'register.reviewRegNumber': 'Registration number',
  'register.reviewEntityType': 'Entity type',
  'register.reviewSector': 'Sector',
  'register.reviewAddress': 'Address',
  'register.reviewMainNumber': 'Main contact number',
  'register.reviewWebsite': 'Website',
  'register.reviewContact': 'Contact',
  'register.reviewEmail': 'Contact email',
  'register.reviewNumber': 'Contact number',
  'register.submitNote':
    'Submitting sends an application to the Department. It does not create an account: the Department confirms the organisation first, then issues one bound to it.',
  'register.nextStep': 'Next: {0}',
  'register.errOrganisation': 'Enter the name of the organisation.',
  'register.errEntityType': 'Choose the entity type.',
  'register.errSector': 'Choose the sector.',
  'register.errAddress': 'Enter the physical address.',
  'register.errProvince': 'Choose the province.',
  'register.errPostalCode': 'A South African postal code is four digits.',
  'register.errPhone': 'Enter a contact number, ten digits.',
  'register.errContactName': 'Enter the full name of the contact.',
  'register.errContactRole': 'Enter their role at the organisation.',
  'register.errWorkEmail': 'Enter a work email address.',

  'forgot.designNote': 'This screen is a design.',
  'forgot.designBody': 'It is not connected and no email is sent.',

  'signin.demoHead': 'Demonstration accounts',
  'signin.demoSub': 'Every role in the system. Tokens are not verified while this is on.',
  'signin.demoReviewer': 'Works the review queue and returns disputed figures',
  'signin.demoExecutive': 'Portfolio and drilldowns. Read only by design',
  'signin.demoAdmin': 'Everything, plus the publication switch',
  'signin.demoReporter': 'Reports for Iziko. Sees one entity and no other',
  'signin.ssoNote':
    'Single sign on for DSAC staff. Demonstration build, so this signs in with the administrator role: federated sign in through Entra ID is not wired, because the Microsoft integration here is a Graph client for SharePoint and Teams, which is documents rather than identity.',
  'signin.ssoNotConfigured': 'Single sign on is not configured in this build.',

  'land.ssoSub': 'Single sign on for departmental staff',
  'land.ssoNotConfiguredSub': 'Single sign on is not configured in this build',
  'land.ssoNote':
    'Demonstration build. Single sign on signs you in with the administrator role. Federated sign in through Entra ID is not wired.',
  'land.ssoNoteOff':
    'Single sign on is not configured in this build. Entities sign in with the account the Department issued.',
} as const;

export type Key = keyof typeof en;
