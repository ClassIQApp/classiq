import type { InterfaceLanguage } from "../pages/settings/language-preferences";

export type TranslationKey =
    | "nav.courses"
    | "nav.settings"
    | "nav.liveLecture"
    | "nav.dashboard"
    | "nav.materials"
    | "sidebar.betterUnderstanding"
    | "sidebar.brighterFutures"
    | "settings.title"
    | "settings.description"
    | "settings.account.title"
    | "settings.account.description"
    | "settings.accessibility.title"
    | "settings.accessibility.description"
    | "settings.language.title"
    | "settings.language.description"
    | "settings.back"
    | "language.eyebrow"
    | "language.title"
    | "language.description"
    | "language.interfaceLanguage"
    | "account.eyebrow"
    | "account.title"
    | "account.description"
    | "account.profile"
    | "account.name"
    | "account.nameDescription"
    | "account.firstName"
    | "account.lastName"
    | "account.email"
    | "account.emailDescription"
    | "account.emailUnavailable"
    | "account.saveChanges"
    | "account.saving"
    | "account.security"
    | "account.changePassword"
    | "account.passwordDescription"
    | "account.currentPassword"
    | "account.newPassword"
    | "account.confirmPassword"
    | "account.passwordHint"
    | "account.changingPassword"
    | "account.logout"
    | "accessibility.eyebrow"
    | "accessibility.title"
    | "accessibility.description"
    | "accessibility.display"
    | "accessibility.textSize"
    | "accessibility.textSizeDescription"
    | "accessibility.small"
    | "accessibility.default"
    | "accessibility.large"
    | "accessibility.captions"
    | "accessibility.automaticCaptions"
    | "accessibility.captionsDescription"
    | "accessibility.playback"
    | "accessibility.playbackSpeed"
    | "accessibility.playbackDescription"
    | "courses.eyebrow"
    | "courses.title"
    | "courses.description"
    | "courses.joinCourse"
    | "courses.createCourse"
    | "courses.yourCourses"
    | "courses.courseCount"
    | "courses.noCourses"
    | "courses.noCoursesDescription"
    | "courses.loading"
    | "courses.loadError"
    | "courses.retry"
    | "courses.joinClass"
    | "courses.joinPrompt"
    | "courses.joinCodePlaceholder"
    | "courses.cancel"
    | "courses.joining"
    | "courses.join"
    | "courses.joinFailed"
    | "courses.unexpectedError"
    | "courses.newCourse"
    | "courses.createDescription"
    | "courses.creating"
    | "courses.courseSettings"
    | "courses.updateDescription"
    | "courses.saveChanges"
    | "courses.saving"
    | "courses.studentJoinCode"
    | "courses.studentJoinCodeDescription"
    | "courses.notAvailable"
    | "courses.copyCode"
    | "courses.courseSingular"
    | "courses.coursePlural"
    | "courses.conflictError"
    | "courseCard.noDescription"
    | "courseCard.lectureSingular"
    | "courseCard.lecturePlural"
    | "courseCard.settings"
    | "courseCard.open"
    | "courseRole.teacher"
    | "courseRole.member"
    | "topbar.instructorMode"
    | "topbar.studentMode"
    | "topbar.logout"
    | "topbar.loggingOut";

type TranslationTable = Record<TranslationKey, string>;

const english: TranslationTable = {
    "nav.courses": "Courses",
    "nav.settings": "Settings",
    "nav.liveLecture": "Live Lecture",
    "nav.dashboard": "Dashboard",
    "nav.materials": "Materials",

    "sidebar.betterUnderstanding": "Better understanding.",
    "sidebar.brighterFutures": "Brighter futures.",

    "settings.title": "Settings",
    "settings.description": "Manage your account and ClassIQ preferences.",

    "settings.account.title": "Account Settings",
    "settings.account.description": "Manage your name, email, password, and account security.",

    "settings.accessibility.title": "Accessibility",
    "settings.accessibility.description": "Adjust text size, captions, playback, and interface preferences.",

    "settings.language.title": "Language & Region",
    "settings.language.description": "Choose the language used throughout the ClassIQ interface.",

    "settings.back": "← Back to Settings",

    "language.eyebrow": "Preferences",
    "language.title": "Language & Region",
    "language.description": "Choose the language used throughout the ClassIQ interface.",
    "language.interfaceLanguage": "Interface Language",

    "account.eyebrow": "Account",
    "account.title": "Account Settings",
    "account.description": "Manage your personal information and account security.",
    "account.profile": "Profile",
    "account.name": "Name",
    "account.nameDescription": "This is the name shown throughout ClassIQ.",
    "account.firstName": "First name",
    "account.lastName": "Last name",
    "account.email": "Email address",
    "account.emailDescription": "The email used to sign in to your account.",
    "account.emailUnavailable": "Email changes are not available yet.",
    "account.saveChanges": "Save changes",
    "account.saving": "Saving...",
    "account.security": "Security",
    "account.changePassword": "Change password",
    "account.passwordDescription": "Update the password you use to sign in to ClassIQ.",
    "account.currentPassword": "Current password",
    "account.newPassword": "New password",
    "account.confirmPassword": "Confirm new password",
    "account.passwordHint": "Use at least 8 characters.",
    "account.changingPassword": "Changing...",
    "account.logout": "Log Out",

    "accessibility.eyebrow": "Preferences",
    "accessibility.title": "Accessibility",
    "accessibility.description": "Make ClassIQ more comfortable to read, watch, and use.",
    "accessibility.display": "Display",
    "accessibility.textSize": "Text size",
    "accessibility.textSizeDescription": "Change the size of text throughout ClassIQ.",
    "accessibility.small": "Small",
    "accessibility.default": "Default",
    "accessibility.large": "Large",
    "accessibility.captions": "Captions",
    "accessibility.automaticCaptions": "Automatic captions",
    "accessibility.captionsDescription": "Show captions automatically when they are available.",
    "accessibility.playback": "Playback",
    "accessibility.playbackSpeed": "Default playback speed",
    "accessibility.playbackDescription": "Choose the speed used when a lecture starts playing.",

    "courses.eyebrow": "My Courses",
    "courses.title": "Courses",
    "courses.description": "Open the courses you teach or have joined, or create a new course.",
    "courses.joinCourse": "Join Course",
    "courses.createCourse": "Create Course",
    "courses.yourCourses": "Your Courses",
    "courses.courseCount": "courses",
    "courses.noCourses": "No courses yet",
    "courses.noCoursesDescription": "Create a course to teach it, or accept an invitation to join one.",
    "courses.loading": "Loading courses…",
    "courses.loadError": "Courses could not load",
    "courses.retry": "Retry",
    "courses.joinClass": "Join a Class",
    "courses.joinPrompt": "Enter the course join code provided by your teacher.",
    "courses.joinCodePlaceholder": "Enter join code...",
    "courses.cancel": "Cancel",
    "courses.joining": "Joining...",
    "courses.join": "Join",
    "courses.joinFailed": "Invalid join code or failed to join course.",
    "courses.unexpectedError": "An unexpected error occurred.",
    "courses.newCourse": "New Course",
    "courses.createDescription": "Enter the information Members will see. You will be this course's Teacher.",
    "courses.creating": "Creating…",
    "courses.courseSettings": "Course Settings",
    "courses.updateDescription": "Update the course information Members will see.",
    "courses.saveChanges": "Save Changes",
    "courses.saving": "Saving…",
    "courses.studentJoinCode": "Student Join Code",
    "courses.studentJoinCodeDescription": "Share this code with students so they can join this course.",
    "courses.notAvailable": "N/A",
    "courses.copyCode": "Copy Code",
    "courses.courseSingular": "course",
    "courses.coursePlural": "courses",
    "courses.conflictError": "A course with this code and name already exists. Change the code or name and try again.",

    "courseCard.noDescription": "No description added.",
    "courseCard.lectureSingular": "lecture",
    "courseCard.lecturePlural": "lectures",
    "courseCard.settings": "Course Settings",
    "courseCard.open": "Open Course",

    "courseRole.teacher": "Teacher",
    "courseRole.member": "Member",

    "topbar.instructorMode": "Instructor Mode",
    "topbar.studentMode": "Student Mode",
    "topbar.logout": "Log Out",
    "topbar.loggingOut": "Logging out…",
};

const spanish: TranslationTable = {
    "nav.courses": "Cursos",
    "nav.settings": "Configuración",
    "nav.liveLecture": "Clase en vivo",
    "nav.dashboard": "Panel",
    "nav.materials": "Materiales",

    "sidebar.betterUnderstanding": "Mejor comprensión.",
    "sidebar.brighterFutures": "Futuros más brillantes.",

    "settings.title": "Configuración",
    "settings.description": "Administra tu cuenta y las preferencias de ClassIQ.",

    "settings.account.title": "Configuración de la cuenta",
    "settings.account.description": "Administra tu nombre, correo electrónico, contraseña y seguridad de la cuenta.",

    "settings.accessibility.title": "Accesibilidad",
    "settings.accessibility.description": "Ajusta el tamaño del texto, los subtítulos, la reproducción y las preferencias de la interfaz.",

    "settings.language.title": "Idioma y región",
    "settings.language.description": "Elige el idioma utilizado en la interfaz de ClassIQ.",

    "settings.back": "← Volver a Configuración",

    "language.eyebrow": "Preferencias",
    "language.title": "Idioma y región",
    "language.description": "Elige el idioma utilizado en la interfaz de ClassIQ.",
    "language.interfaceLanguage": "Idioma de la interfaz",

    "account.eyebrow": "Cuenta",
    "account.title": "Configuración de la cuenta",
    "account.description": "Administra tu información personal y la seguridad de tu cuenta.",
    "account.profile": "Perfil",
    "account.name": "Nombre",
    "account.nameDescription": "Este es el nombre que se muestra en ClassIQ.",
    "account.firstName": "Nombre",
    "account.lastName": "Apellido",
    "account.email": "Correo electrónico",
    "account.emailDescription": "El correo utilizado para iniciar sesión en tu cuenta.",
    "account.emailUnavailable": "Los cambios de correo electrónico aún no están disponibles.",
    "account.saveChanges": "Guardar cambios",
    "account.saving": "Guardando...",
    "account.security": "Seguridad",
    "account.changePassword": "Cambiar contraseña",
    "account.passwordDescription": "Actualiza la contraseña que utilizas para iniciar sesión en ClassIQ.",
    "account.currentPassword": "Contraseña actual",
    "account.newPassword": "Nueva contraseña",
    "account.confirmPassword": "Confirmar nueva contraseña",
    "account.passwordHint": "Usa al menos 8 caracteres.",
    "account.changingPassword": "Cambiando...",
    "account.logout": "Cerrar sesión",

    "accessibility.eyebrow": "Preferencias",
    "accessibility.title": "Accesibilidad",
    "accessibility.description": "Haz que ClassIQ sea más cómodo de leer, ver y usar.",
    "accessibility.display": "Pantalla",
    "accessibility.textSize": "Tamaño del texto",
    "accessibility.textSizeDescription": "Cambia el tamaño del texto en ClassIQ.",
    "accessibility.small": "Pequeño",
    "accessibility.default": "Predeterminado",
    "accessibility.large": "Grande",
    "accessibility.captions": "Subtítulos",
    "accessibility.automaticCaptions": "Subtítulos automáticos",
    "accessibility.captionsDescription": "Muestra subtítulos automáticamente cuando estén disponibles.",
    "accessibility.playback": "Reproducción",
    "accessibility.playbackSpeed": "Velocidad de reproducción predeterminada",
    "accessibility.playbackDescription": "Elige la velocidad utilizada cuando comienza una clase.",

    "courses.eyebrow": "Mis cursos",
    "courses.title": "Cursos",
    "courses.description": "Abre los cursos que enseñas o a los que te has unido, o crea un nuevo curso.",
    "courses.joinCourse": "Unirse a un curso",
    "courses.createCourse": "Crear curso",
    "courses.yourCourses": "Tus cursos",
    "courses.courseCount": "cursos",
    "courses.noCourses": "Aún no hay cursos",
    "courses.noCoursesDescription": "Crea un curso para enseñar o acepta una invitación para unirte.",
    "courses.loading": "Cargando cursos…",
    "courses.loadError": "No se pudieron cargar los cursos",
    "courses.retry": "Reintentar",
    "courses.joinClass": "Unirse a una clase",
    "courses.joinPrompt": "Ingresa el código del curso proporcionado por tu profesor.",
    "courses.joinCodePlaceholder": "Ingresa el código...",
    "courses.cancel": "Cancelar",
    "courses.joining": "Uniéndose...",
    "courses.join": "Unirse",
    "courses.joinFailed": "Código inválido o no se pudo unir al curso.",
    "courses.unexpectedError": "Ocurrió un error inesperado.",
    "courses.newCourse": "Nuevo curso",
    "courses.createDescription": "Ingresa la información que verán los miembros. Serás el profesor de este curso.",
    "courses.creating": "Creando…",
    "courses.courseSettings": "Configuración del curso",
    "courses.updateDescription": "Actualiza la información del curso que verán los miembros.",
    "courses.saveChanges": "Guardar cambios",
    "courses.saving": "Guardando…",
    "courses.studentJoinCode": "Código para estudiantes",
    "courses.studentJoinCodeDescription": "Comparte este código con los estudiantes para que puedan unirse al curso.",
    "courses.notAvailable": "N/D",
    "courses.copyCode": "Copiar código",
    "courses.courseSingular": "curso",
    "courses.coursePlural": "cursos",
    "courses.conflictError": "Ya existe un curso con este código y nombre. Cambia el código o el nombre e inténtalo de nuevo.",

    "courseCard.noDescription": "No se agregó una descripción.",
    "courseCard.lectureSingular": "clase",
    "courseCard.lecturePlural": "clases",
    "courseCard.settings": "Configuración del curso",
    "courseCard.open": "Abrir curso",

    "courseRole.teacher": "Profesor",
    "courseRole.member": "Miembro",

    "topbar.instructorMode": "Modo instructor",
    "topbar.studentMode": "Modo estudiante",
    "topbar.logout": "Cerrar sesión",
    "topbar.loggingOut": "Cerrando sesión…",
};

const arabic: TranslationTable = {
    "nav.courses": "المقررات",
    "nav.settings": "الإعدادات",
    "nav.liveLecture": "المحاضرة المباشرة",
    "nav.dashboard": "لوحة التحكم",
    "nav.materials": "المواد",

    "sidebar.betterUnderstanding": "فهم أفضل.",
    "sidebar.brighterFutures": "مستقبل أكثر إشراقًا.",

    "settings.title": "الإعدادات",
    "settings.description": "إدارة حسابك وتفضيلات ClassIQ.",

    "settings.account.title": "إعدادات الحساب",
    "settings.account.description": "إدارة الاسم والبريد الإلكتروني وكلمة المرور وأمان الحساب.",

    "settings.accessibility.title": "إمكانية الوصول",
    "settings.accessibility.description": "تعديل حجم النص والترجمة وسرعة التشغيل وتفضيلات الواجهة.",

    "settings.language.title": "اللغة والمنطقة",
    "settings.language.description": "اختر اللغة المستخدمة في واجهة ClassIQ.",

    "settings.back": "العودة إلى الإعدادات →",

    "language.eyebrow": "التفضيلات",
    "language.title": "اللغة والمنطقة",
    "language.description": "اختر اللغة المستخدمة في واجهة ClassIQ.",
    "language.interfaceLanguage": "لغة الواجهة",

    "account.eyebrow": "الحساب",
    "account.title": "إعدادات الحساب",
    "account.description": "إدارة معلوماتك الشخصية وأمان حسابك.",
    "account.profile": "الملف الشخصي",
    "account.name": "الاسم",
    "account.nameDescription": "هذا هو الاسم الذي يظهر في ClassIQ.",
    "account.firstName": "الاسم الأول",
    "account.lastName": "اسم العائلة",
    "account.email": "البريد الإلكتروني",
    "account.emailDescription": "البريد الإلكتروني المستخدم لتسجيل الدخول إلى حسابك.",
    "account.emailUnavailable": "تغيير البريد الإلكتروني غير متاح حالياً.",
    "account.saveChanges": "حفظ التغييرات",
    "account.saving": "جارٍ الحفظ...",
    "account.security": "الأمان",
    "account.changePassword": "تغيير كلمة المرور",
    "account.passwordDescription": "قم بتحديث كلمة المرور المستخدمة لتسجيل الدخول إلى ClassIQ.",
    "account.currentPassword": "كلمة المرور الحالية",
    "account.newPassword": "كلمة المرور الجديدة",
    "account.confirmPassword": "تأكيد كلمة المرور الجديدة",
    "account.passwordHint": "استخدم 8 أحرف على الأقل.",
    "account.changingPassword": "جارٍ التغيير...",
    "account.logout": "تسجيل الخروج",

    "accessibility.eyebrow": "التفضيلات",
    "accessibility.title": "إمكانية الوصول",
    "accessibility.description": "اجعل ClassIQ أكثر راحة للقراءة والمشاهدة والاستخدام.",
    "accessibility.display": "العرض",
    "accessibility.textSize": "حجم النص",
    "accessibility.textSizeDescription": "غيّر حجم النص في ClassIQ.",
    "accessibility.small": "صغير",
    "accessibility.default": "افتراضي",
    "accessibility.large": "كبير",
    "accessibility.captions": "الترجمة",
    "accessibility.automaticCaptions": "الترجمة التلقائية",
    "accessibility.captionsDescription": "اعرض الترجمة تلقائياً عند توفرها.",
    "accessibility.playback": "التشغيل",
    "accessibility.playbackSpeed": "سرعة التشغيل الافتراضية",
    "accessibility.playbackDescription": "اختر السرعة المستخدمة عند بدء تشغيل المحاضرة.",

    "courses.eyebrow": "مقرراتي",
    "courses.title": "المقررات",
    "courses.description": "افتح المقررات التي تدرّسها أو انضممت إليها، أو أنشئ مقرراً جديداً.",
    "courses.joinCourse": "الانضمام إلى مقرر",
    "courses.createCourse": "إنشاء مقرر",
    "courses.yourCourses": "مقرراتك",
    "courses.courseCount": "مقررات",
    "courses.noCourses": "لا توجد مقررات بعد",
    "courses.noCoursesDescription": "أنشئ مقرراً لتدريسه أو اقبل دعوة للانضمام إلى مقرر.",
    "courses.loading": "جارٍ تحميل المقررات…",
    "courses.loadError": "تعذر تحميل المقررات",
    "courses.retry": "إعادة المحاولة",
    "courses.joinClass": "الانضمام إلى مقرر",
    "courses.joinPrompt": "أدخل رمز الانضمام الذي قدمه لك المدرس.",
    "courses.joinCodePlaceholder": "أدخل رمز الانضمام...",
    "courses.cancel": "إلغاء",
    "courses.joining": "جارٍ الانضمام...",
    "courses.join": "انضمام",
    "courses.joinFailed": "رمز الانضمام غير صالح أو تعذر الانضمام إلى المقرر.",
    "courses.unexpectedError": "حدث خطأ غير متوقع.",
    "courses.newCourse": "مقرر جديد",
    "courses.createDescription": "أدخل المعلومات التي سيراها الأعضاء. ستكون أنت مدرس هذا المقرر.",
    "courses.creating": "جارٍ الإنشاء…",
    "courses.courseSettings": "إعدادات المقرر",
    "courses.updateDescription": "حدّث معلومات المقرر التي سيراها الأعضاء.",
    "courses.saveChanges": "حفظ التغييرات",
    "courses.saving": "جارٍ الحفظ…",
    "courses.studentJoinCode": "رمز انضمام الطلاب",
    "courses.studentJoinCodeDescription": "شارك هذا الرمز مع الطلاب حتى يتمكنوا من الانضمام إلى المقرر.",
    "courses.notAvailable": "غير متاح",
    "courses.copyCode": "نسخ الرمز",
    "courses.courseSingular": "مقرر",
    "courses.coursePlural": "مقررات",
    "courses.conflictError": "يوجد مقرر بهذا الرمز والاسم بالفعل. غيّر الرمز أو الاسم وحاول مرة أخرى.",

    "courseCard.noDescription": "لم تتم إضافة وصف.",
    "courseCard.lectureSingular": "محاضرة",
    "courseCard.lecturePlural": "محاضرات",
    "courseCard.settings": "إعدادات المقرر",
    "courseCard.open": "فتح المقرر",

    "courseRole.teacher": "مدرس",
    "courseRole.member": "عضو",

    "topbar.instructorMode": "وضع المدرس",
    "topbar.studentMode": "وضع الطالب",
    "topbar.logout": "تسجيل الخروج",
    "topbar.loggingOut": "جارٍ تسجيل الخروج…",
};

const german: TranslationTable = {
    "nav.courses": "Kurse",
    "nav.settings": "Einstellungen",
    "nav.liveLecture": "Live-Vorlesung",
    "nav.dashboard": "Übersicht",
    "nav.materials": "Materialien",

    "sidebar.betterUnderstanding": "Besseres Verständnis.",
    "sidebar.brighterFutures": "Eine bessere Zukunft.",

    "settings.title": "Einstellungen",
    "settings.description": "Verwalte dein Konto und deine ClassIQ-Einstellungen.",

    "settings.account.title": "Kontoeinstellungen",
    "settings.account.description": "Verwalte deinen Namen, deine E-Mail-Adresse, dein Passwort und die Kontosicherheit.",

    "settings.accessibility.title": "Barrierefreiheit",
    "settings.accessibility.description": "Passe Textgröße, Untertitel, Wiedergabe und Oberflächeneinstellungen an.",

    "settings.language.title": "Sprache & Region",
    "settings.language.description": "Wähle die Sprache für die ClassIQ-Oberfläche.",

    "settings.back": "← Zurück zu Einstellungen",

    "language.eyebrow": "Einstellungen",
    "language.title": "Sprache & Region",
    "language.description": "Wähle die Sprache für die ClassIQ-Oberfläche.",
    "language.interfaceLanguage": "Oberflächensprache",

    "account.eyebrow": "Konto",
    "account.title": "Kontoeinstellungen",
    "account.description": "Verwalte deine persönlichen Informationen und die Sicherheit deines Kontos.",
    "account.profile": "Profil",
    "account.name": "Name",
    "account.nameDescription": "Dieser Name wird in ClassIQ angezeigt.",
    "account.firstName": "Vorname",
    "account.lastName": "Nachname",
    "account.email": "E-Mail-Adresse",
    "account.emailDescription": "Die E-Mail-Adresse, mit der du dich anmeldest.",
    "account.emailUnavailable": "E-Mail-Änderungen sind derzeit nicht verfügbar.",
    "account.saveChanges": "Änderungen speichern",
    "account.saving": "Speichern...",
    "account.security": "Sicherheit",
    "account.changePassword": "Passwort ändern",
    "account.passwordDescription": "Ändere das Passwort, mit dem du dich bei ClassIQ anmeldest.",
    "account.currentPassword": "Aktuelles Passwort",
    "account.newPassword": "Neues Passwort",
    "account.confirmPassword": "Neues Passwort bestätigen",
    "account.passwordHint": "Verwende mindestens 8 Zeichen.",
    "account.changingPassword": "Wird geändert...",
    "account.logout": "Abmelden",

    "accessibility.eyebrow": "Einstellungen",
    "accessibility.title": "Barrierefreiheit",
    "accessibility.description": "Passe ClassIQ an, damit es angenehmer zu lesen, anzusehen und zu verwenden ist.",
    "accessibility.display": "Anzeige",
    "accessibility.textSize": "Textgröße",
    "accessibility.textSizeDescription": "Ändere die Textgröße in ClassIQ.",
    "accessibility.small": "Klein",
    "accessibility.default": "Standard",
    "accessibility.large": "Groß",
    "accessibility.captions": "Untertitel",
    "accessibility.automaticCaptions": "Automatische Untertitel",
    "accessibility.captionsDescription": "Zeige Untertitel automatisch an, wenn sie verfügbar sind.",
    "accessibility.playback": "Wiedergabe",
    "accessibility.playbackSpeed": "Standard-Wiedergabegeschwindigkeit",
    "accessibility.playbackDescription": "Wähle die Geschwindigkeit, mit der Vorlesungen starten.",

    "courses.eyebrow": "Meine Kurse",
    "courses.title": "Kurse",
    "courses.description": "Öffne Kurse, die du unterrichtest oder denen du beigetreten bist, oder erstelle einen neuen Kurs.",
    "courses.joinCourse": "Kurs beitreten",
    "courses.createCourse": "Kurs erstellen",
    "courses.yourCourses": "Deine Kurse",
    "courses.courseCount": "Kurse",
    "courses.noCourses": "Noch keine Kurse",
    "courses.noCoursesDescription": "Erstelle einen Kurs oder nimm eine Einladung zu einem Kurs an.",
    "courses.loading": "Kurse werden geladen…",
    "courses.loadError": "Kurse konnten nicht geladen werden",
    "courses.retry": "Erneut versuchen",
    "courses.joinClass": "Einem Kurs beitreten",
    "courses.joinPrompt": "Gib den Kurscode ein, den du von deiner Lehrkraft erhalten hast.",
    "courses.joinCodePlaceholder": "Kurscode eingeben...",
    "courses.cancel": "Abbrechen",
    "courses.joining": "Beitritt läuft...",
    "courses.join": "Beitreten",
    "courses.joinFailed": "Ungültiger Kurscode oder Beitritt fehlgeschlagen.",
    "courses.unexpectedError": "Ein unerwarteter Fehler ist aufgetreten.",
    "courses.newCourse": "Neuer Kurs",
    "courses.createDescription": "Gib die Informationen ein, die Mitglieder sehen werden. Du bist die Lehrkraft dieses Kurses.",
    "courses.creating": "Wird erstellt…",
    "courses.courseSettings": "Kurseinstellungen",
    "courses.updateDescription": "Aktualisiere die Kursinformationen, die Mitglieder sehen werden.",
    "courses.saveChanges": "Änderungen speichern",
    "courses.saving": "Speichern…",
    "courses.studentJoinCode": "Kurscode für Studierende",
    "courses.studentJoinCodeDescription": "Teile diesen Code mit Studierenden, damit sie dem Kurs beitreten können.",
    "courses.notAvailable": "N/V",
    "courses.copyCode": "Code kopieren",
    "courses.courseSingular": "Kurs",
    "courses.coursePlural": "Kurse",
    "courses.conflictError": "Ein Kurs mit diesem Code und Namen existiert bereits. Ändere den Code oder Namen und versuche es erneut.",

    "courseCard.noDescription": "Keine Beschreibung hinzugefügt.",
    "courseCard.lectureSingular": "Vorlesung",
    "courseCard.lecturePlural": "Vorlesungen",
    "courseCard.settings": "Kurseinstellungen",
    "courseCard.open": "Kurs öffnen",

    "courseRole.teacher": "Lehrkraft",
    "courseRole.member": "Mitglied",

    "topbar.instructorMode": "Dozentenmodus",
    "topbar.studentMode": "Studentenmodus",
    "topbar.logout": "Abmelden",
    "topbar.loggingOut": "Abmeldung läuft…",
};

const french: TranslationTable = {
    "nav.courses": "Cours",
    "nav.settings": "Paramètres",
    "nav.liveLecture": "Cours en direct",
    "nav.dashboard": "Tableau de bord",
    "nav.materials": "Documents",

    "sidebar.betterUnderstanding": "Une meilleure compréhension.",
    "sidebar.brighterFutures": "Un avenir plus prometteur.",

    "settings.title": "Paramètres",
    "settings.description": "Gérez votre compte et vos préférences ClassIQ.",

    "settings.account.title": "Paramètres du compte",
    "settings.account.description": "Gérez votre nom, votre adresse e-mail, votre mot de passe et la sécurité du compte.",

    "settings.accessibility.title": "Accessibilité",
    "settings.accessibility.description": "Ajustez la taille du texte, les sous-titres, la lecture et les préférences de l’interface.",

    "settings.language.title": "Langue et région",
    "settings.language.description": "Choisissez la langue utilisée dans l’interface ClassIQ.",

    "settings.back": "← Retour aux paramètres",

    "language.eyebrow": "Préférences",
    "language.title": "Langue et région",
    "language.description": "Choisissez la langue utilisée dans l’interface ClassIQ.",
    "language.interfaceLanguage": "Langue de l’interface",

    "account.eyebrow": "Compte",
    "account.title": "Paramètres du compte",
    "account.description": "Gérez vos informations personnelles et la sécurité de votre compte.",
    "account.profile": "Profil",
    "account.name": "Nom",
    "account.nameDescription": "Il s’agit du nom affiché dans ClassIQ.",
    "account.firstName": "Prénom",
    "account.lastName": "Nom de famille",
    "account.email": "Adresse e-mail",
    "account.emailDescription": "L’adresse e-mail utilisée pour vous connecter à votre compte.",
    "account.emailUnavailable": "La modification de l’adresse e-mail n’est pas encore disponible.",
    "account.saveChanges": "Enregistrer les modifications",
    "account.saving": "Enregistrement...",
    "account.security": "Sécurité",
    "account.changePassword": "Modifier le mot de passe",
    "account.passwordDescription": "Modifiez le mot de passe utilisé pour vous connecter à ClassIQ.",
    "account.currentPassword": "Mot de passe actuel",
    "account.newPassword": "Nouveau mot de passe",
    "account.confirmPassword": "Confirmer le nouveau mot de passe",
    "account.passwordHint": "Utilisez au moins 8 caractères.",
    "account.changingPassword": "Modification...",
    "account.logout": "Se déconnecter",

    "accessibility.eyebrow": "Préférences",
    "accessibility.title": "Accessibilité",
    "accessibility.description": "Rendez ClassIQ plus confortable à lire, regarder et utiliser.",
    "accessibility.display": "Affichage",
    "accessibility.textSize": "Taille du texte",
    "accessibility.textSizeDescription": "Modifiez la taille du texte dans ClassIQ.",
    "accessibility.small": "Petit",
    "accessibility.default": "Par défaut",
    "accessibility.large": "Grand",
    "accessibility.captions": "Sous-titres",
    "accessibility.automaticCaptions": "Sous-titres automatiques",
    "accessibility.captionsDescription": "Affichez automatiquement les sous-titres lorsqu’ils sont disponibles.",
    "accessibility.playback": "Lecture",
    "accessibility.playbackSpeed": "Vitesse de lecture par défaut",
    "accessibility.playbackDescription": "Choisissez la vitesse utilisée au démarrage d’un cours.",

    "courses.eyebrow": "Mes cours",
    "courses.title": "Cours",
    "courses.description": "Ouvrez les cours que vous enseignez ou avez rejoints, ou créez un nouveau cours.",
    "courses.joinCourse": "Rejoindre un cours",
    "courses.createCourse": "Créer un cours",
    "courses.yourCourses": "Vos cours",
    "courses.courseCount": "cours",
    "courses.noCourses": "Aucun cours pour le moment",
    "courses.noCoursesDescription": "Créez un cours à enseigner ou acceptez une invitation à rejoindre un cours.",
    "courses.loading": "Chargement des cours…",
    "courses.loadError": "Impossible de charger les cours",
    "courses.retry": "Réessayer",
    "courses.joinClass": "Rejoindre un cours",
    "courses.joinPrompt": "Entrez le code du cours fourni par votre enseignant.",
    "courses.joinCodePlaceholder": "Entrez le code...",
    "courses.cancel": "Annuler",
    "courses.joining": "Connexion...",
    "courses.join": "Rejoindre",
    "courses.joinFailed": "Code invalide ou impossible de rejoindre le cours.",
    "courses.unexpectedError": "Une erreur inattendue s’est produite.",
    "courses.newCourse": "Nouveau cours",
    "courses.createDescription": "Entrez les informations que les membres verront. Vous serez l’enseignant de ce cours.",
    "courses.creating": "Création…",
    "courses.courseSettings": "Paramètres du cours",
    "courses.updateDescription": "Mettez à jour les informations du cours que les membres verront.",
    "courses.saveChanges": "Enregistrer les modifications",
    "courses.saving": "Enregistrement…",
    "courses.studentJoinCode": "Code d’accès étudiant",
    "courses.studentJoinCodeDescription": "Partagez ce code avec les étudiants afin qu’ils puissent rejoindre ce cours.",
    "courses.notAvailable": "N/D",
    "courses.copyCode": "Copier le code",
    "courses.courseSingular": "cours",
    "courses.coursePlural": "cours",
    "courses.conflictError": "Un cours avec ce code et ce nom existe déjà. Modifiez le code ou le nom et réessayez.",

    "courseCard.noDescription": "Aucune description ajoutée.",
    "courseCard.lectureSingular": "cours",
    "courseCard.lecturePlural": "cours",
    "courseCard.settings": "Paramètres du cours",
    "courseCard.open": "Ouvrir le cours",

    "courseRole.teacher": "Enseignant",
    "courseRole.member": "Membre",

    "topbar.instructorMode": "Mode enseignant",
    "topbar.studentMode": "Mode étudiant",
    "topbar.logout": "Se déconnecter",
    "topbar.loggingOut": "Déconnexion…",
};

export const translations: Record<InterfaceLanguage, TranslationTable> = {
    en: english,
    es: spanish,
    ar: arabic,
    de: german,
    fr: french,
};

export function translate(language: InterfaceLanguage, key: TranslationKey): string {
    return translations[language]?.[key] ?? translations.en[key];
}
