const Index = () => {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
      {/* Background Image */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: 'url(/images/bg-pattern.jpg)' }}
      />
      
      {/* Dark Overlay with Blur */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      
      {/* Content */}
      <div className="relative z-10 text-center">
        <h1 className="mb-4 text-4xl font-bold text-foreground">ברוכים הבאים</h1>
        <p className="text-xl text-muted-foreground">מערכת ניטור בטיחות ילדים חכמה</p>
      </div>
    </div>
  );
};

export default Index;
