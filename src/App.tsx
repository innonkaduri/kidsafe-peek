import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Home from "./pages/Home";
import MyChildren from "./pages/MyChildren";
import Alerts from "./pages/Alerts";
import Forum from "./pages/Forum";
import TeachersDashboard from "./pages/TeachersDashboard";
import Settings from "./pages/Settings";
import Auth from "./pages/Auth";
import ChildProfile from "./pages/ChildProfile";
import Policy from "./pages/Policy";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/my-children" element={<MyChildren />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/forum" element={<Forum />} />
            <Route path="/teachers" element={<TeachersDashboard />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/child/:childId" element={<ChildProfile />} />
            <Route path="/policy" element={<Policy />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
