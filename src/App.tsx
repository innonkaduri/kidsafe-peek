import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";
import ChildProfile from "./pages/ChildProfile";
import Policy from "./pages/Policy";
import NotFound from "./pages/NotFound";
import Children from "./pages/Children";
import Alerts from "./pages/Alerts";
import TeachersDashboard from "./pages/TeachersDashboard";
import ParentsForum from "./pages/ParentsForum";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/child/:childId" element={<ChildProfile />} />
            <Route path="/policy" element={<Policy />} />
            <Route path="/children" element={<Children />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/teachers" element={<TeachersDashboard />} />
            <Route path="/forum" element={<ParentsForum />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
