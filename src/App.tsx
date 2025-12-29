import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { RoleProvider } from "@/hooks/useRole";
import { BackgroundSync } from "@/components/BackgroundSync";
import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";
import ChildProfile from "./pages/ChildProfile";
import Policy from "./pages/Policy";
import NotFound from "./pages/NotFound";
import Children from "./pages/Children";
import Alerts from "./pages/Alerts";
import TeacherPortal from "./pages/TeacherPortal";
import TeacherTicket from "./pages/TeacherTicket";
import ParentsForum from "./pages/ParentsForum";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <RoleProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <BackgroundSync />
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/child/:childId" element={<ChildProfile />} />
              <Route path="/policy" element={<Policy />} />
              <Route path="/children" element={<Children />} />
              <Route path="/alerts" element={<Alerts />} />

              {/* Teacher routes */}
              <Route path="/teachers" element={<Navigate to="/teacher-portal" replace />} />
              <Route path="/teacher-portal" element={<TeacherPortal />} />
              <Route path="/teacher-ticket/:ticketId" element={<TeacherTicket />} />

              <Route path="/forum" element={<ParentsForum />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </RoleProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
