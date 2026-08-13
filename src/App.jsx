import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
// Add page imports here
import Home from '@/pages/Home';
import CityChapterDetail from '@/pages/CityChapterDetail';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import ArtistCommunity from '@/pages/ArtistCommunity';
import ForumPostDetail from '@/pages/ForumPostDetail';
import ArtistProfileEdit from '@/pages/ArtistProfileEdit';
import ArtistProfileView from '@/pages/ArtistProfileView';
import ArtistsDirectory from '@/pages/ArtistsDirectory';
import Upgrade from '@/pages/Upgrade';
import Messages from '@/pages/Messages';
import GalleryShowcase from '@/pages/GalleryShowcase';
import GalleryProfile from '@/pages/GalleryProfile';
import EventCalendar from '@/pages/EventCalendar';
import EventDetail from '@/pages/EventDetail';
import Notifications from '@/pages/Notifications';
import OpenCalls from '@/pages/OpenCalls';
import ArtistMap from '@/pages/ArtistMap';
import GalleryMap from '@/pages/GalleryMap';
import Venues from '@/pages/Venues';
import Editorial from '@/pages/Editorial';
import ArticleReader from '@/pages/ArticleReader';
import AboutUs from '@/pages/AboutUs';
import TermsAndConditions from '@/pages/TermsAndConditions';
import PrivacyPolicy from '@/pages/PrivacyPolicy';
import CookiePolicy from '@/pages/CookiePolicy';
import MembershipPolicy from '@/pages/MembershipPolicy';
import Partnership from '@/pages/Partnership';
import AdminDashboard from '@/pages/AdminDashboard';
import CollectorProfilePage from '@/pages/CollectorProfilePage';
import Onboarding from '@/pages/Onboarding';
import CollectorProfileView from '@/pages/CollectorProfileView';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';
import LFrameCursor from '@/components/LFrameCursor';
import { Navigate } from 'react-router-dom';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <>
      {/*
        Mounted ONCE here, above <Routes>, rather than per page.

        index.css sets `body { cursor: none }` globally so the custom cursor
        can replace the system one. But LFrameCursor was imported into each
        page individually and six pages never included it — Login, Register,
        ForgotPassword, ResetPassword, Onboarding and ArticleReader — so those
        pages had NO cursor at all. Several auth routes also render outside
        <Layout>, so putting it there would not have covered them either.

        Mounting at the router root guarantees every route has a cursor,
        including PageNotFound and any route added later.
      */}
      <LFrameCursor />
    <Routes>
      {/* Pages wrapped in the site header + footer layout */}
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/chapter/:slug" element={<CityChapterDetail />} />
        <Route path="/artists" element={<ArtistsDirectory />} />
        <Route path="/artists/:id" element={<ArtistProfileView />} />
        <Route path="/upgrade" element={<Upgrade />} />
        <Route path="/gallery" element={<GalleryShowcase />} />
        <Route path="/gallery/:id" element={<GalleryProfile />} />
        <Route path="/events" element={<EventCalendar />} />
        <Route path="/events/:id" element={<EventDetail />} />
        <Route path="/open-calls" element={<OpenCalls />} />
        <Route path="/editorial" element={<Editorial />} />
        <Route path="/editorial/:slug" element={<ArticleReader />} />
        <Route path="/map" element={<ArtistMap />} />
        <Route path="/gallery-map" element={<GalleryMap />} />
        <Route path="/venues" element={<Venues />} />
        <Route path="/venues/:id" element={<GalleryProfile />} />
        <Route path="/about" element={<AboutUs />} />
        <Route path="/terms" element={<TermsAndConditions />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/cookies" element={<CookiePolicy />} />
        <Route path="/membership-policy" element={<MembershipPolicy />} />
        <Route path="/partnership" element={<Partnership />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
          <Route path="/community" element={<ArtistCommunity />} />
          <Route path="/community/post/:id" element={<ForumPostDetail />} />
          <Route path="/profile/edit" element={<ArtistProfileEdit />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/collector-profile" element={<CollectorProfilePage />} />
          <Route path="/collector-profile/view" element={<CollectorProfileView />} />
        </Route>
      </Route>
      {/* Standalone (own focused chrome) */}
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route path="/messages" element={<Messages />} />
      </Route>
      <Route path="/onboarding" element={<Onboarding />} />
      {/* Auth routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App