import { Link } from 'react-router-dom';
import { Shield, ArrowRight, Lock, Eye, Database, Bell, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Policy() {
  return (
    <div className="min-h-screen bg-background">
      <header className="glass-card border-b border-border/50 sticky top-0 z-50">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-heebo font-bold text-lg">SafeKids Guardian</span>
          </Link>
          <Button asChild variant="ghost">
            <Link to="/">
              <ArrowRight className="w-4 h-4" />
              חזרה
            </Link>
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-6 py-12 max-w-4xl">
        <div className="space-y-8 animate-slide-up">
          <div className="text-center mb-12">
            <h1 className="font-heebo text-4xl font-bold text-gradient mb-4">
              מדיניות פרטיות ואיסוף נתונים
            </h1>
            <p className="text-muted-foreground text-lg">
              השקיפות שלנו לגבי מה אנחנו אוספים ולמה
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-primary" />
                מה אנחנו אוספים
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                <strong className="text-foreground">ממצאים וסיכומי סיכונים בלבד:</strong> אנחנו לא שומרים את כל ההודעות. 
                במקום זאת, אנחנו שומרים רק את הממצאים הרלוונטיים, קטעי ראיות קצרים, ותמונות ממוזערות.
              </p>
              <p>
                <strong className="text-foreground">מטא-דאטה:</strong> שמות שיחות, מספר הודעות, ותאריכים - ללא תוכן מלא.
              </p>
              <p>
                <strong className="text-foreground">תוצאות AI:</strong> ניתוחי הסיכונים מוצפנים ונשמרים לצורך היסטוריה בלבד.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-primary" />
                אבטחת מידע
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                <strong className="text-foreground">הצפנה:</strong> כל המידע מוצפן בזמן העברה ובאחסון.
              </p>
              <p>
                <strong className="text-foreground">יומן גישה:</strong> כל גישה לראיות ברמת סיכון גבוהה מתועדת.
              </p>
              <p>
                <strong className="text-foreground">אימות מחודש:</strong> נדרש אימות נוסף לפני צפייה בראיות רגישות.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5 text-primary" />
                מינימליזציה של נתונים
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                אנחנו מאמינים בעיקרון "הכי פחות נתונים שצריך". לכן:
              </p>
              <ul className="list-disc list-inside space-y-2 mr-4">
                <li>לא שומרים היסטוריית שיחות מלאה כברירת מחדל</li>
                <li>קטעי ראיות מוגבלים ל-10 הודעות סביבתיות</li>
                <li>תמונות נשמרות כתמונות ממוזערות בלבד</li>
                <li>נתונים נמחקים אוטומטית לאחר תקופה מוגדרת</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary" />
                הסכמה ומודעות
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                <strong className="text-foreground">הסכמת הורים:</strong> נדרשת הסכמה מפורשת של ההורה/אפוטרופוס.
              </p>
              <p>
                <strong className="text-foreground">מודעות הילד:</strong> הילד/ה חייב/ת להיות מודע/ת לניטור - אין מצב סתר.
              </p>
              <p>
                <strong className="text-foreground">אינדיקציית ניטור:</strong> תג "ניטור פעיל" מוצג בכל פרופיל ילד.
              </p>
            </CardContent>
          </Card>

          <div className="text-center text-sm text-muted-foreground pt-8 border-t border-border">
            <p>עדכון אחרון: דצמבר 2024</p>
            <p className="mt-2">לשאלות נוספות, פנו אלינו בכתובת privacy@safekids.example.com</p>
          </div>
        </div>
      </main>
    </div>
  );
}
