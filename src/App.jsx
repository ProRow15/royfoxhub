import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc,
  getDoc,
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query,
  where,
  writeBatch 
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { 
  Crown, CalendarDays, MapPin, Users, CheckCircle2, 
  Clock, DollarSign, Plus, Home, AlertCircle, User, Lock, 
  LayoutList, Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, 
  CheckSquare, AlertTriangle, FileText, Edit, Trash2, Bell, Check, Key, TrendingUp, BarChart3, Sparkles, Loader2, Eye, EyeOff, Phone, MessageSquare, List, LogOut,
  Bed, Bath, Maximize, Camera, Box, AlertOctagon, ImageIcon, UserPlus, Copy
} from 'lucide-react';

// --- FIREBASE INITIALIZATION ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const appId = 'royal-fox-hub';

const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
const secondaryAuth = getAuth(secondaryApp);

// --- PATH HELPERS ---
const getCol = (name) => collection(db, name);
const getDocRef = (name, id) => doc(db, name, id);

// --- HELPER COMPONENTS ---
const getStatusBadge = (status) => {
  switch(status) {
    case 'unassigned': return <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-[10px] font-black uppercase rounded-full border border-slate-200">Unassigned</span>;
    case 'scheduled': return <span className="px-2.5 py-1 bg-blue-100 text-blue-700 text-[10px] font-black uppercase rounded-full border border-blue-200">Scheduled</span>;
    case 'confirmed': return <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 text-[10px] font-black uppercase rounded-full border border-indigo-200 flex items-center gap-1"><Check className="w-3 h-3"/> Confirmed</span>;
    case 'in-progress': return <span className="px-2.5 py-1 bg-amber-100 text-amber-700 text-[10px] font-black uppercase rounded-full flex items-center gap-1 border border-amber-200"><Clock className="w-3 h-3"/> Active</span>;
    case 'completed': return <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase rounded-full flex items-center gap-1 border border-emerald-200"><CheckCircle2 className="w-3 h-3"/> Done</span>;
    case 'issue': return <span className="px-2.5 py-1 bg-red-100 text-red-700 text-[10px] font-black uppercase rounded-full flex items-center gap-1 border border-red-200 animate-pulse"><AlertOctagon className="w-3 h-3"/> Issue Flagged</span>;
    default: return null;
  }
};

const parseICalDate = (str) => {
  if (!str) return new Date();
  const clean = str.split('T')[0].replace(/[^0-9]/g, '');
  const y = clean.substring(0, 4);
  const m = clean.substring(4, 6);
  const d = clean.substring(6, 8);
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
};

export default function App() {
  // --- PERSISTENCE HELPERS ---
  const getSaved = (key, defaultValue) => {
    try {
      const saved = localStorage.getItem(key);
      if (saved === null || saved === "undefined") return defaultValue;
      return JSON.parse(saved);
    } catch (e) {
      return defaultValue;
    }
  };

  const setSaved = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn("Storage write failed (likely Safari Private Mode/Storage Limits).", e);
    }
  };

  // --- STATE ---
  const [user, setUser] = useState(null); 
  const [userRole, setUserRole] = useState(null); // null means show login screen
  const [userName, setUserName] = useState('');

  // Authentication State
  const [loginMode, setLoginMode] = useState('admin');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  const [sessionUser, setSessionUser] = useState(() => {
    const saved = getSaved('royalFox_sessionUser', null);
    return typeof saved === 'string' ? saved : 'Royal Fox Owners';
  });
  
  const [activeTab, setActiveTab] = useState(() => getSaved('royalFox_activeTab', 'Royal Fox Owners'));
  const [ownerView, setOwnerView] = useState(() => getSaved('royalFox_ownerView', 'schedule'));
  const [cleanerView, setCleanerView] = useState('schedule');
  const [ownerTeamFilter, setOwnerTeamFilter] = useState('All Teams');
  
  const [viewMode, setViewMode] = useState(() => getSaved('royalFox_viewMode', 'list'));
  const [currentMonth, setCurrentMonth] = useState(new Date()); 
  const [earningsMonthFilter, setEarningsMonthFilter] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [rangeFilter, setRangeFilter] = useState('All Time');
  const [statusFilter, setStatusFilter] = useState('All Status');

  // Earnings specific states
  const [earningsDate, setEarningsDate] = useState(new Date());
  const [earningsCleanerFilter, setEarningsCleanerFilter] = useState('All');
  const [taxYear, setTaxYear] = useState(new Date().getFullYear().toString());

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAddTeamModalOpen, setIsAddTeamModalOpen] = useState(false);
  const [addCleanerError, setAddCleanerError] = useState('');

  const [isEditTeamModalOpen, setIsEditTeamModalOpen] = useState(false);
  const [editTeamData, setEditTeamData] = useState(null);

  const [isEditPropertyModalOpen, setIsEditPropertyModalOpen] = useState(false);
  const [editPropertyData, setEditPropertyData] = useState(null);

  // iCal Sync States
  const [isIcalModalOpen, setIsIcalModalOpen] = useState(false);
  const [selectedIcalProperty, setSelectedIcalProperty] = useState(null);
  const [icalEvents, setIcalEvents] = useState([]);
  const [icalLoading, setIcalLoading] = useState(false);
  const [currentIcalMonth, setCurrentIcalMonth] = useState(new Date());

  // Job Modal States
  const [selectedJob, setSelectedJob] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editJobData, setEditJobData] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [isReportingIssue, setIsReportingIssue] = useState(false);
  const [issueText, setIssueText] = useState('');
  const [isAddPropertyModalOpen, setIsAddPropertyModalOpen] = useState(false);
  const [isClearJobsModalOpen, setIsClearJobsModalOpen] = useState(false);

  // --- CLOUD DATA ---
  const [team, setTeam] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [properties, setProperties] = useState([]);

  const propertyTypeOptions = ["Apartment", "Condo", "House", "Townhouse", "Duplex", "A-Frame", "Cabin", "Studio", "Other"];

  const [newProperty, setNewProperty] = useState({ 
    name: '', address: '', lastCleaned: 'Never', accessCode: '',
    bedrooms: '', bathrooms: '', squareFootage: '', propertyType: 'House', icalLink: ''
  });

  const defaultChecklistTemplate = [
    { task: "Strip and wash all linens & towels", done: false },
    { task: "Sanitize kitchen counters & appliances", done: false },
    { task: "Deep clean bathrooms (toilets, showers, mirrors)", done: false },
    { task: "Vacuum and mop all floors", done: false },
    { task: "Restock TP, paper towels, and coffee", done: false },
    { task: "Empty all trash bins & reline", done: false },
    { task: "Check for damages left by guest", done: false },
  ];

  const [newJob, setNewJob] = useState({
    date: new Date().toISOString().split('T')[0], startTime: '10:00 AM', endTime: '3:00 PM',
    propertyId: '', assigneeUid: '', payout: 100, type: 'Turnaround', notes: '',
    checklist: [...defaultChecklistTemplate]
  });

  const [newTeam, setNewTeam] = useState({ name: '', role: '', phone: '', email: '', password: '' });

  const unresolvedAlertsCount = alerts.filter(a => !a.resolved).length;

  // --- FIREBASE AUTH & SYNC ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
        await signInAnonymously(auth);
      } catch (error) { 
        console.error("Auth init error, attempting anonymous fallback without explicit persistence:", error); 
        try {
          await signInAnonymously(auth);
        } catch(fallbackErr) {
          console.error("Critical Auth Error:", fallbackErr);
        }
      }
    };
    initAuth();
      
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
        setUser(currentUser);
        if (currentUser && !currentUser.isAnonymous) {
            if (currentUser.email === 'sorrellsmanagement@gmail.com' || currentUser.uid === 'GgQ61y6kSlUE6AsLPmmdk2spKhi1') {
                setUserRole('admin');
                setUserName('Royal Fox Owners');
            } else if (!currentUser.email && typeof __initial_auth_token !== 'undefined') {
                setUserRole('admin');
                setUserName('Admin Preview');
            } else {
                setUserRole('cleaner');
                setUserName(currentUser.email?.split('@')[0] || 'Cleaner');
            }
        } else {
            setUserRole(null); 
        }
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user || !userRole) return;

    let unsubTeam = () => {};
    let unsubJobs = () => {};
    let unsubAlerts = () => {};
    let unsubProps = () => {};

    const teamRef = getCol('team');
    const jobsRef = getCol('jobs');
    const alertsRef = getCol('alerts');
    const propsRef = getCol('properties');

    if (userRole === 'admin') {
      unsubTeam = onSnapshot(teamRef, snap => setTeam(snap.docs.map(d => ({ id: d.id, ...d.data() }))), err => console.error("Team sync error", err));
      unsubJobs = onSnapshot(jobsRef, snap => setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() }))), err => console.error("Jobs sync error", err));
      unsubAlerts = onSnapshot(alertsRef, snap => setAlerts(snap.docs.map(d => ({ id: d.id, ...d.data() }))), err => console.error("Alert sync error", err));
      unsubProps = onSnapshot(propsRef, snap => setProperties(snap.docs.map(d => ({ id: d.id, ...d.data() }))), err => console.error("Props sync error", err));
    } else if (userRole === 'cleaner') {
      unsubTeam = onSnapshot(teamRef, snap => setTeam(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
      unsubJobs = onSnapshot(jobsRef, snap => {
          const allJobs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setJobs(allJobs.filter(j => j.assigneeUid === user.uid));
      });
      unsubProps = onSnapshot(propsRef, snap => setProperties(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
      unsubAlerts = onSnapshot(alertsRef, snap => {
          const allAlerts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setAlerts(allAlerts.filter(a => a.teamUid === user.uid));
      });
    }

    return () => { unsubTeam(); unsubJobs(); unsubAlerts(); unsubProps(); };
  }, [user, userRole]);

  useEffect(() => { setSaved('royalFox_sessionUser', sessionUser); }, [sessionUser]);
  useEffect(() => { setSaved('royalFox_activeTab', activeTab); }, [activeTab]);
  useEffect(() => { setSaved('royalFox_viewMode', viewMode); }, [viewMode]);
  useEffect(() => { setSaved('royalFox_ownerView', ownerView); }, [ownerView]);

  // --- HELPERS ---
  const getTeamColor = (assigneeName) => {
    const foundTeam = team.find(t => t.name === assigneeName);
    return foundTeam ? foundTeam.color : "bg-slate-100 border-slate-200 text-slate-900";
  };

  const getPropertyAccessCode = (propertyId) => {
    const prop = properties.find(p => p.id === propertyId);
    return prop ? prop.accessCode : "None Set";
  };
  
  const getPropertyName = (propertyId) => {
    const prop = properties.find(p => p.id === propertyId);
    return prop ? prop.name : "Unknown Property";
  };

  const openIcalModal = async (property) => {
    setSelectedIcalProperty(property);
    setIsIcalModalOpen(true);
    setIcalLoading(true);
    setIcalEvents([]);
    setCurrentIcalMonth(new Date());

    try {
        // Updated to use a more stable proxy for client side iCal fetching
        // PRODUCTION NOTE: Consider replacing this with a Firebase Cloud Function that securely fetches the URL
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(property.icalLink)}`;
        const response = await fetch(proxyUrl);
        const data = await response.text();
        
        const events = [];
        const lines = data.split(/\r?\n/);
        let currentEvent = null;
        
        lines.forEach(line => {
            if (line.startsWith('BEGIN:VEVENT')) {
                currentEvent = {};
            } else if (line.startsWith('END:VEVENT')) {
                if (currentEvent && currentEvent.start && currentEvent.end) events.push(currentEvent);
                currentEvent = null;
            } else if (currentEvent && line.startsWith('DTSTART')) {
                currentEvent.start = parseICalDate(line.split(':')[1]);
            } else if (currentEvent && line.startsWith('DTEND')) {
                currentEvent.end = parseICalDate(line.split(':')[1]);
            } else if (currentEvent && line.startsWith('SUMMARY')) {
                currentEvent.summary = line.substring(8).trim();
            }
        });
        setIcalEvents(events);
    } catch (err) {
        console.error("Failed to parse iCal", err);
    } finally {
        setIcalLoading(false);
    }
  };

  // --- CLOUD ACTIONS ---
  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    const targetEmail = loginMode === 'admin' ? 'sorrellsmanagement@gmail.com' : loginEmail;
    try {
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch (persistErr) {
        console.warn("Could not set explicit local persistence, falling back to default.", persistErr);
      }
      await signInWithEmailAndPassword(auth, targetEmail, loginPassword);
    } catch (err) {
      setAuthError(err.message.replace("Firebase: ", ""));
    } finally {
      setAuthLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    const targetEmail = loginMode === 'admin' ? 'sorrellsmanagement@gmail.com' : loginEmail;
    if (!targetEmail) { 
      setAuthError("Please enter your account email first."); 
      return; 
    }
    try {
      await sendPasswordResetEmail(auth, targetEmail);
      setAuthError("Password reset link sent! Check your email.");
    } catch (err) {
      setAuthError(err.message.replace("Firebase: ", ""));
    }
  };

  const handleLogout = async () => { 
    try {
      await signOut(auth);
      await signInAnonymously(auth); 
      setLoginPassword(''); 
    } catch (error) {
      console.error(error);
    }
  };

  const advanceStatus = async (e, id, currentStatus) => {
    if (e) e.stopPropagation();
    if (!user) return;
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const nextStatusMap = { 
        'unassigned': 'scheduled', 'scheduled': 'confirmed', 
        'confirmed': 'in-progress', 'in-progress': 'completed', 
        'issue': 'in-progress', 'completed': 'completed' 
    };
    const newStatus = nextStatusMap[currentStatus];
    const jobRef = getDocRef('jobs', id);
    
    let updates = { status: newStatus };
    if (newStatus === 'in-progress' && currentStatus === 'confirmed') updates.timeStarted = now;
    if (newStatus === 'completed' && currentStatus === 'in-progress') updates.timeCompleted = now;

    if (currentStatus === 'issue') {
        const batch = writeBatch(db);
        batch.update(jobRef, updates);
        const relatedAlerts = alerts.filter(a => a.jobId === id && !a.resolved);
        relatedAlerts.forEach(a => batch.update(getDocRef('alerts', a.id), { resolved: true }));
        try { await batch.commit(); return; } catch(e) { console.error(e); return; }
    }

    try { await updateDoc(jobRef, updates); } catch (e) { console.error("Error updating status", e); }
  };

  const revertStatus = async (e, id) => {
    if (e) e.stopPropagation();
    if (!user) return;
    const jobRef = getDocRef('jobs', id);
    try { await updateDoc(jobRef, { status: 'in-progress', timeCompleted: null, paid: false }); } catch(e) {}
  };

  const markJobPaid = async (jobId) => {
    if (!user || userRole !== 'admin') return;
    try {
      await updateDoc(getDocRef('jobs', jobId), { 
          paid: true, 
          paidAt: new Date().toISOString(),
          paidBy: user.uid 
      });
    } catch(e) { console.error("Error marking paid", e); }
  };

  const payTeam = async (teamUid) => {
    if (!user || userRole !== 'admin') return;
    const batch = writeBatch(db);
    const now = new Date().toISOString();
    jobs.forEach(job => {
      if (job.assigneeUid === teamUid && job.status === 'completed' && !job.paid) {
        batch.update(getDocRef('jobs', job.id), { paid: true, paidAt: now, paidBy: user.uid });
      }
    });
    try { await batch.commit(); } catch(e) {}
  };

  const handleClearAllJobs = async () => {
    if (!user || userRole !== 'admin') return;
    const batch = writeBatch(db);
    jobs.forEach(job => batch.delete(getDocRef('jobs', job.id)));
    try { await batch.commit(); setIsClearJobsModalOpen(false); } catch(e) {}
  };

  const handleDeleteJob = async (jobId) => {
    if (!user || userRole !== 'admin') return;
    try { await deleteDoc(getDocRef('jobs', jobId)); closeJobModal(); } catch (e) { console.error("Error deleting job", e); }
  };

  const handleDeleteTeam = async (teamId) => {
    if (!user || userRole !== 'admin') return;
    try { await deleteDoc(getDocRef('team', teamId)); } catch (e) { console.error("Error deleting team member", e); }
  };

  const handleDeleteProperty = async (propertyId) => {
    if (!user || userRole !== 'admin') return;
    try { await deleteDoc(getDocRef('properties', propertyId)); } catch (e) { console.error("Error deleting property", e); }
  };

  const handleDeleteAlert = async (alertId) => {
    if (!user || userRole !== 'admin') return;
    try { await deleteDoc(getDocRef('alerts', alertId)); } catch (e) { console.error("Error deleting alert", e); }
  };

  const handleUpdateTeamSubmit = async (e) => {
    e.preventDefault();
    if (!user || userRole !== 'admin' || !editTeamData) return;
    try {
      await updateDoc(getDocRef('team', editTeamData.id), {
        name: editTeamData.name,
        role: editTeamData.role,
        phone: editTeamData.phone
      });
      setIsEditTeamModalOpen(false);
      setEditTeamData(null);
    } catch(err) {
      console.error("Error updating team:", err);
    }
  };

  const handleUpdatePropertySubmit = async (e) => {
    e.preventDefault();
    if (!user || userRole !== 'admin' || !editPropertyData) return;
    try {
      await updateDoc(getDocRef('properties', editPropertyData.id), editPropertyData);
      setIsEditPropertyModalOpen(false);
      setEditPropertyData(null);
    } catch(err) {
      console.error("Error updating property:", err);
    }
  };

  const handleAddJobSubmit = async (e) => {
    e.preventDefault();
    if (!user || userRole !== 'admin') return;
    const [year, month, day] = newJob.date.split('-');
    const dateObj = new Date(year, month - 1, day);
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const formattedDate = `${dayNames[dateObj.getDay()]}, ${monthNames[dateObj.getMonth()]} ${dateObj.getDate()}`;
    
    const assignedTeam = team.find(t => t.uid === newJob.assigneeUid);
    
    const newJobEntry = {
      date: formattedDate, isoDate: newJob.date, checkOut: newJob.startTime, checkIn: newJob.endTime,   
      propertyId: newJob.propertyId, assigneeUid: newJob.assigneeUid || 'unassigned',
      assigneeName: assignedTeam ? assignedTeam.name : 'Unassigned',
      status: !newJob.assigneeUid || newJob.assigneeUid === 'unassigned' ? 'unassigned' : 'scheduled',
      payout: Number(newJob.payout), type: newJob.type, checklist: newJob.checklist, notes: newJob.notes || "",
      paid: false, timeStarted: null, timeCompleted: null, photos: []
    };
    
    try {
      await addDoc(getCol('jobs'), newJobEntry);
      setIsAddModalOpen(false);
      setNewJob({ date: new Date().toISOString().split('T')[0], startTime: '10:00 AM', endTime: '3:00 PM', propertyId: '', assigneeUid: '', payout: 100, type: 'Turnaround', notes: '', checklist: [...defaultChecklistTemplate] });
    } catch(e) { console.error("Error adding job", e); }
  };

  const handleUpdateJobSubmit = async (e) => {
    e.preventDefault();
    if (!user || userRole !== 'admin' || !editJobData) return;
    try {
        const jobRef = getDocRef('jobs', selectedJob.id);
        await updateDoc(jobRef, editJobData);
        setSelectedJob({...selectedJob, ...editJobData});
        setIsEditMode(false);
    } catch (err) {
        console.error("Update error", err);
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !user) return;

    setIsUploading(true);
    setUploadError('');

    try {
        const fileRef = ref(storage, `photos/${selectedJob.id}/${Date.now()}_${file.name}`);
        await uploadBytes(fileRef, file);
        const url = await getDownloadURL(fileRef);

        const jobRef = getDocRef('jobs', selectedJob.id);
        const updatedPhotos = [...(selectedJob.photos || []), url];

        await updateDoc(jobRef, { photos: updatedPhotos });
        setSelectedJob({ ...selectedJob, photos: updatedPhotos });
    } catch (err) {
        console.error("Upload error:", err);
        setUploadError('Failed to upload. Please check Firebase Storage rules.');
    } finally {
        setIsUploading(false);
    }
  };

  const handleDeletePhoto = async (e, photoUrl) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;
    try {
        const updatedPhotos = selectedJob.photos.filter(url => url !== photoUrl);
        await updateDoc(getDocRef('jobs', selectedJob.id), { photos: updatedPhotos });
        setSelectedJob({ ...selectedJob, photos: updatedPhotos });

        // Safely extract the exact storage path from the Firebase download URL for deletion
        const pathRegex = /\/o\/(.*?)\?alt=media/i;
        const match = photoUrl.match(pathRegex);
        if (match && match[1]) {
            const filePath = decodeURIComponent(match[1]);
            const fileRef = ref(storage, filePath);
            await deleteObject(fileRef);
        } else {
            // Fallback strategy if URL parsing fails
            const fileRef = ref(storage, photoUrl);
            await deleteObject(fileRef);
        }
    } catch (err) {
        console.error("Error deleting photo", err);
    }
  };

  const handleAddTeamSubmit = async (e) => {
    e.preventDefault();
    if (!user || userRole !== 'admin') return; 
    setAddCleanerError('');

    try {
      let newUid;
      try {
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newTeam.email, newTeam.password);
        newUid = userCredential.user.uid;
      } catch (authErr) {
        if (authErr.code === 'auth/email-already-in-use') {
          try {
            const signInCredential = await signInWithEmailAndPassword(secondaryAuth, newTeam.email, newTeam.password);
            newUid = signInCredential.user.uid;
          } catch (signInErr) {
            throw new Error("This email exists in Firebase, but the password provided is incorrect.");
          }
        } else {
          throw authErr; 
        }
      }
      
      await signOut(secondaryAuth); 

      const colorOptions = [
        "bg-emerald-100 border-emerald-200 text-emerald-900", 
        "bg-rose-100 border-rose-200 text-rose-900", 
        "bg-cyan-100 border-cyan-200 text-cyan-900", 
        "bg-indigo-100 border-indigo-200 text-indigo-900", 
        "bg-pink-100 border-pink-200 text-pink-900"
      ];
      const nextColor = colorOptions[team.length % colorOptions.length];
      
      await addDoc(getCol('team'), { 
        uid: newUid, 
        name: newTeam.name, 
        email: newTeam.email,
        role: newTeam.role || 'Cleaner', 
        phone: newTeam.phone, 
        color: nextColor 
      });
      
      setIsAddTeamModalOpen(false);
      setNewTeam({ name: '', role: '', phone: '', email: '', password: '' });
    } catch(err) { 
      setAddCleanerError(err.message || "Failed to add cleaner."); 
    }
  };

  const resetAddCleanerModal = () => {
    setIsAddTeamModalOpen(false);
    setAddCleanerError('');
    setNewTeam({ name: '', role: '', phone: '', email: '', password: '' });
  };

  const handleAddPropertySubmit = async (e) => {
    e.preventDefault();
    if (!user || userRole !== 'admin') return;
    try {
      await addDoc(getCol('properties'), newProperty);
      setIsAddPropertyModalOpen(false);
      setNewProperty({ name: '', address: '', lastCleaned: 'Never', accessCode: '', bedrooms: '', bathrooms: '', squareFootage: '', propertyType: 'House', icalLink: '' });
    } catch(e) {}
  };

  const handleJobClick = (job) => { 
    setSelectedJob(job); 
    setIsEditMode(false); 
    setIsReportingIssue(false); 
    setIssueText(''); 
    setUploadError(''); 
  };
  
  const closeJobModal = () => { 
    setSelectedJob(null); 
    setIsEditMode(false); 
    setIsReportingIssue(false); 
    setIssueText(''); 
    setUploadError('');
  };
  
  const toggleChecklistItem = async (jobId, taskIndex) => {
    if (!user) return;
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;
    const newChecklist = [...job.checklist];
    newChecklist[taskIndex].done = !newChecklist[taskIndex].done;
    try { await updateDoc(getDocRef('jobs', jobId), { checklist: newChecklist }); } catch(e) {}
  };

  const resolveAlert = async (id, jobId) => { 
    if (!user || userRole !== 'admin') return;
    try { 
        const batch = writeBatch(db);
        batch.update(getDocRef('alerts', id), { resolved: true });
        if (jobId) {
            const linkedJob = jobs.find(j => j.id === jobId);
            if (linkedJob && linkedJob.status === 'issue') {
                batch.update(getDocRef('jobs', jobId), { status: 'in-progress' });
                if (selectedJob && selectedJob.id === jobId) {
                    setSelectedJob(prev => ({ ...prev, status: 'in-progress' }));
                }
            }
        }
        await batch.commit();
    } catch(e) { console.error("Error resolving alert", e); }
  };

  const submitIssue = async () => {
    if (!issueText.trim() || !user) return;
    const newAlert = { jobId: selectedJob.id, propertyId: selectedJob.propertyId, propertyName: getPropertyName(selectedJob.propertyId), teamUid: user.uid, teamName: userName, message: issueText, date: new Date().toLocaleDateString(), resolved: false };
    try {
      await addDoc(getCol('alerts'), newAlert);
      await updateDoc(getDocRef('jobs', selectedJob.id), { status: 'issue' });
      if (selectedJob.id) { setSelectedJob(prev => ({ ...prev, status: 'issue' })); }
      setIsReportingIssue(false);
      setIssueText('');
    } catch(e) {}
  };

  const handleGenerateW9 = (cleanerUid, year, totalPaid) => {
    if (cleanerUid === 'All') {
        alert("Please select a specific cleaner from the filter dropdown above to generate their W-9 packet.");
        return;
    }
    const cleaner = team.find(t => t.uid === cleanerUid);
    if (!cleaner) return;

    const html = `
      <html>
        <head>
          <title>W-9 & Tax Packet - ${cleaner.name}</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #0f172a; line-height: 1.6; }
            .container { max-width: 800px; margin: 0 auto; border: 2px solid #e2e8f0; padding: 40px; border-radius: 16px; }
            h1 { font-size: 24px; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 8px; text-align: center; }
            h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; margin-top: 32px; }
            .subtitle { text-align: center; color: #64748b; font-weight: bold; margin-bottom: 40px; }
            .stat { font-size: 32px; font-weight: 900; color: #10b981; margin: 8px 0; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; }
            .box { background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; }
            .label { font-size: 10px; text-transform: uppercase; font-weight: bold; color: #94a3b8; letter-spacing: 1px; }
            .value { font-size: 16px; font-weight: bold; margin-top: 4px; }
            .action { margin-top: 40px; padding: 24px; background: #fffbeb; border: 2px dashed #fcd34d; border-radius: 12px; text-align: center; }
            .btn { display: inline-block; background: #0f172a; color: #fff; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 8px; margin-top: 16px; }
            .footer { text-align: center; font-size: 12px; color: #94a3b8; margin-top: 40px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Independent Contractor Tax Packet</h1>
            <div class="subtitle">Royal Fox Operations</div>
            
            <div class="info-grid">
               <div class="box">
                   <div class="label">Contractor Name</div>
                   <div class="value">${cleaner.name}</div>
                   <div class="label" style="margin-top: 16px;">Contact Info</div>
                   <div class="value" style="font-weight: normal;">${cleaner.email || 'No email provided'}<br/>${cleaner.phone || 'No phone provided'}</div>
               </div>
               <div class="box" style="text-align: right;">
                   <div class="label">Tax Year</div>
                   <div class="value" style="font-size: 24px;">${year}</div>
                   <div class="label" style="margin-top: 16px;">Total Earnings Paid</div>
                   <div class="stat">$${totalPaid.toFixed(2)}</div>
               </div>
            </div>

            <div class="action">
               <h3 style="margin-top: 0; color: #b45309; text-transform: uppercase; letter-spacing: 1px;">Action Required: W-9 Form</h3>
               <p style="color: #78350f; margin-bottom: 0;">To fulfill IRS reporting requirements, please download, complete, and return an official W-9 form to management.</p>
               <a href="https://www.irs.gov/pub/irs-pdf/fw9.pdf" target="_blank" class="btn">Download Official IRS W-9</a>
            </div>
            
            <div class="footer">This document is generated for informational purposes and is not a substitute for professional tax advice.</div>
          </div>
          <script>
            setTimeout(() => window.print(), 1000);
          </script>
        </body>
      </html>
    `;
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
  };

  const getActionButton = (job) => {
    switch(job.status) {
      case 'unassigned': return <button onClick={(e) => advanceStatus(e, job.id, job.status)} className="px-5 py-2.5 bg-slate-900 text-white text-[10px] font-black uppercase rounded-xl">Assign</button>;
      case 'scheduled': return <button onClick={(e) => advanceStatus(e, job.id, job.status)} className="px-5 py-2.5 bg-indigo-600 text-white text-[10px] font-black uppercase rounded-xl">Confirm</button>;
      case 'confirmed': return <button onClick={(e) => advanceStatus(e, job.id, job.status)} className="px-5 py-2.5 bg-amber-500 text-slate-900 text-[10px] font-black uppercase rounded-xl">Start</button>;
      case 'in-progress': return <button onClick={(e) => advanceStatus(e, job.id, job.status)} className="px-5 py-2.5 bg-emerald-600 text-white text-[10px] font-black uppercase rounded-xl">Finish</button>;
      case 'issue': return userRole === 'admin' 
          ? <button onClick={(e) => advanceStatus(e, job.id, job.status)} className="px-5 py-2.5 bg-red-600 text-white text-[10px] font-black uppercase rounded-xl hover:bg-red-500 transition-colors">Resolve</button>
          : <span className="px-5 py-2.5 bg-red-50 text-red-500 text-[10px] font-black uppercase rounded-xl border border-red-100 cursor-not-allowed">Pending Admin</span>;
      case 'completed': return <button onClick={(e) => revertStatus(e, job.id)} className="px-5 py-2.5 bg-slate-100 text-slate-400 text-[10px] font-black uppercase rounded-xl">Undo</button>;
      default: return null;
    }
  };

  // --- VIEWS ---

  // LOGIN SCREEN
  if (!userRole) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 font-sans selection:bg-amber-200 animate-in fade-in duration-500">
        <div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-8 relative overflow-hidden">
          <div className="flex flex-col items-center mb-8 text-center">
            <div className="bg-amber-500 p-4 rounded-[1.5rem] shadow-lg mb-6 border border-amber-400">
              <Crown className="w-8 h-8 text-slate-900" />
            </div>
            <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">Royal Fox</h1>
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em] mt-2">Authentication Portal</p>
          </div>

          <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-8">
            <button 
              type="button"
              onClick={() => { setLoginMode('admin'); setAuthError(''); }} 
              className={`flex-1 py-3 text-[10px] font-black uppercase rounded-xl transition-all ${loginMode === 'admin' ? 'bg-white shadow-sm text-slate-900 border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Admin Portal
            </button>
            <button 
              type="button"
              onClick={() => { setLoginMode('cleaner'); setAuthError(''); }} 
              className={`flex-1 py-3 text-[10px] font-black uppercase rounded-xl transition-all ${loginMode === 'cleaner' ? 'bg-white shadow-sm text-slate-900 border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Cleaner Portal
            </button>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {authError && (
              <div className="bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-widest p-4 rounded-2xl border border-red-100 text-center animate-in slide-in-from-top-2">
                {authError}
              </div>
            )}
            
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">
                Account Email
              </label>
              <div className="relative">
                <input 
                  type="email" 
                  value={loginMode === 'admin' ? 'sorrellsmanagement@gmail.com' : loginEmail} 
                  onChange={e => setLoginEmail(e.target.value)}
                  disabled={loginMode === 'admin'}
                  placeholder="name@royalfox.com"
                  className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-60 disabled:bg-slate-100 transition-all pl-12"
                  required
                />
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              </div>
            </div>
            
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">
                Password
              </label>
              <div className="relative">
                <input 
                  type="password" 
                  value={loginPassword} 
                  onChange={e => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all pl-12"
                  required
                />
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              </div>
              <div className="text-right mt-1">
                <button type="button" onClick={handlePasswordReset} className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-amber-500 transition-colors">Forgot Password?</button>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={authLoading} 
              className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl shadow-xl mt-6 uppercase tracking-[0.2em] transition-all hover:bg-slate-800 disabled:opacity-70 flex justify-center items-center hover:shadow-slate-900/20 active:scale-[0.98]"
            >
              {authLoading ? <Loader2 className="w-6 h-6 animate-spin text-amber-500" /> : 'Secure Login'}
            </button>
          </form>
        </div>
        
        <div className="mt-8 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
          <Shield className="w-4 h-4 text-amber-500/50" />
          Encrypted Connection
        </div>
      </div>
    );
  }

  function Shield(props) {
    return (
      <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
      </svg>
    )
  }

  const renderCalendarView = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    
    const filteredJobs = jobs.filter(job => {
        if (userRole === 'admin' && ownerTeamFilter !== 'All Teams') { return job.assigneeName === ownerTeamFilter; }
        return true; 
    });

    return (
      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden mt-4 animate-in fade-in">
        <div className="flex justify-between items-center px-8 py-6 border-b bg-slate-50">
          <button onClick={() => setCurrentMonth(new Date(year, month - 1, 1))} className="p-2 hover:bg-white rounded-full transition-all"><ChevronLeft className="w-5 h-5 text-slate-600" /></button>
          <h3 className="text-lg font-black text-slate-900 uppercase tracking-widest leading-none">{monthNames[month]} {year}</h3>
          <button onClick={() => setCurrentMonth(new Date(year, month + 1, 1))} className="p-2 hover:bg-white rounded-full transition-all"><ChevronRight className="w-5 h-5 text-slate-600" /></button>
        </div>
        <div className="grid grid-cols-7 border-b bg-slate-100">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <div key={d} className="py-2 text-center text-[10px] font-black text-slate-400 uppercase tracking-tighter">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: firstDayIndex }).map((_, i) => <div key={`b-${i}`} className="min-h-[120px] bg-slate-50/50 border-r border-b border-slate-100"></div>)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayJobs = filteredJobs.filter(j => j.isoDate === dateStr);
            return (
              <div key={day} className="min-h-[120px] p-2 border-r border-b border-slate-100 bg-white hover:bg-slate-50 transition-colors">
                <div className="font-black text-slate-300 text-xs mb-1">{day}</div>
                <div className="space-y-1">
                  {dayJobs.map(j => (
                    <div 
                      key={j.id} 
                      onClick={() => handleJobClick(j)} 
                      className={`text-[9px] p-1.5 rounded-xl font-bold truncate cursor-pointer shadow-sm border transition-all hover:scale-95 ${j.status === 'completed' ? 'bg-slate-100 text-slate-400 line-through border-slate-200' : `${getTeamColor(j.assigneeName)} border-white/20`}`}
                    >
                      <span className="block opacity-70 mb-0.5">{j.checkOut}</span>
                      {getPropertyName(j.propertyId)}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const getFilteredJobsList = () => {
    let filtered = jobs.filter(job => {
        if (userRole === 'admin' && ownerTeamFilter !== 'All Teams') { return job.assigneeName === ownerTeamFilter; }
        return true;
    });

    if (statusFilter !== 'All Status') { filtered = filtered.filter(j => j.status.toLowerCase() === statusFilter.toLowerCase()); }
    const today = new Date().toISOString().split('T')[0];
    if (rangeFilter === 'Today') { filtered = filtered.filter(j => j.isoDate === today); }
    else if (rangeFilter === 'This Week') {
      const weekLater = new Date(); weekLater.setDate(weekLater.getDate() + 7);
      const limit = weekLater.toISOString().split('T')[0];
      filtered = filtered.filter(j => j.isoDate >= today && j.isoDate <= limit);
    } else if (rangeFilter === 'This Month') {
      const monthStr = today.substring(0, 7);
      filtered = filtered.filter(j => j.isoDate.startsWith(monthStr));
    }
    
    // Sort jobs in chronological order (earliest date first)
    filtered.sort((a, b) => {
      if (a.isoDate < b.isoDate) return -1;
      if (a.isoDate > b.isoDate) return 1;
      return 0;
    });
    
    return filtered;
  };

  const renderEarningsView = () => {
    const prevMonth = () => setEarningsDate(new Date(earningsDate.getFullYear(), earningsDate.getMonth() - 1, 1));
    const nextMonth = () => setEarningsDate(new Date(earningsDate.getFullYear(), earningsDate.getMonth() + 1, 1));
    const monthStr = `${earningsDate.getFullYear()}-${String(earningsDate.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = earningsDate.toLocaleDateString('default', { month: 'long', year: 'numeric' });

    let baseJobs = jobs;
    if (userRole === 'admin' && earningsCleanerFilter !== 'All') {
        baseJobs = jobs.filter(j => j.assigneeUid === earningsCleanerFilter);
    } else if (userRole === 'cleaner') {
        baseJobs = jobs.filter(j => j.assigneeUid === user.uid);
    }

    const monthJobs = baseJobs.filter(j => j.isoDate.startsWith(monthStr));
    const potential = monthJobs.filter(j => j.status !== 'completed').reduce((s, j) => s + j.payout, 0);
    const completed = monthJobs.filter(j => j.status === 'completed').reduce((s, j) => s + j.payout, 0);
    const paidOut = monthJobs.filter(j => j.paid).reduce((s, j) => s + j.payout, 0);
    const outstanding = completed - paidOut;

    const taxJobs = baseJobs.filter(j => j.isoDate.startsWith(taxYear) && j.paid);
    const yearlyTotal = taxJobs.reduce((s, j) => s + j.payout, 0);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
           {userRole === 'admin' && (
               <div className="flex items-center gap-4 bg-white p-4 rounded-[2rem] border border-slate-200 shadow-sm">
                   <span className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">Filter:</span>
                   <select value={earningsCleanerFilter} onChange={e => setEarningsCleanerFilter(e.target.value)} className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-xs font-black outline-none flex-1">
                       <option value="All">All Cleaners</option>
                       {team.map(t => <option key={t.uid} value={t.uid}>{t.name}</option>)}
                   </select>
               </div>
           )}

           <div className="flex justify-between items-center bg-white p-4 rounded-[2rem] shadow-sm border border-slate-200">
              <button onClick={prevMonth} className="p-3 hover:bg-slate-50 rounded-full transition-all"><ChevronLeft className="w-5 h-5 text-slate-600"/></button>
              <h3 className="font-black text-slate-900 uppercase tracking-widest">{monthLabel}</h3>
              <button onClick={nextMonth} className="p-3 hover:bg-slate-50 rounded-full transition-all"><ChevronRight className="w-5 h-5 text-slate-600"/></button>
           </div>

           <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 p-6 rounded-[2rem] shadow-sm">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Potential Earnings</p>
                  <p className="text-3xl font-black text-slate-900 flex items-center"><DollarSign className="w-5 h-5 text-slate-300"/>{potential}</p>
              </div>
              <div className="bg-blue-50 border border-blue-100 p-6 rounded-[2rem] shadow-sm">
                  <p className="text-[9px] font-black uppercase tracking-widest text-blue-400 mb-1">Completed Earnings</p>
                  <p className="text-3xl font-black text-blue-900 flex items-center"><DollarSign className="w-5 h-5 text-blue-300"/>{completed}</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-[2rem] shadow-sm">
                  <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 mb-1">Paid Out</p>
                  <p className="text-3xl font-black text-emerald-700 flex items-center"><DollarSign className="w-5 h-5 text-emerald-400"/>{paidOut}</p>
              </div>
              <div className="bg-amber-50 border border-amber-100 p-6 rounded-[2rem] shadow-sm">
                  <p className="text-[9px] font-black uppercase tracking-widest text-amber-600 mb-1">Outstanding</p>
                  <p className="text-3xl font-black text-amber-700 flex items-center"><DollarSign className="w-5 h-5 text-amber-400"/>{outstanding}</p>
              </div>
           </div>

           <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-8 overflow-hidden">
               <h3 className="text-lg font-black text-slate-900 uppercase tracking-widest mb-6">Monthly Report</h3>
               <div className="space-y-3">
                   {monthJobs.length === 0 ? <p className="text-center text-slate-400 py-10 font-bold uppercase tracking-widest text-[10px]">No jobs logged this month</p> : 
                   monthJobs.map(job => (
                       <div key={job.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 rounded-2xl border border-slate-100 hover:bg-slate-50 transition-colors gap-4">
                           <div className="flex-1">
                               <div className="flex items-center gap-3 mb-1">
                                   <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{job.date}</span>
                                   {getStatusBadge(job.status)}
                               </div>
                               <h4 className="font-black text-slate-900 text-lg leading-none">{getPropertyName(job.propertyId)}</h4>
                               <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mt-1">{job.type} {userRole === 'admin' && `• ${job.assigneeName}`}</p>
                           </div>
                           <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                               <div className="text-right">
                                   <p className="font-black text-slate-900 text-xl flex items-center justify-end"><DollarSign className="w-4 h-4 text-emerald-500"/>{job.payout}</p>
                                   <p className={`text-[9px] font-black uppercase tracking-widest ${job.paid ? 'text-emerald-500' : 'text-amber-500'}`}>{job.paid ? 'Paid' : 'Unpaid'}</p>
                               </div>
                               <div className="flex gap-2">
                                   {userRole === 'admin' && job.status === 'completed' && !job.paid && (
                                       <button onClick={() => markJobPaid(job.id)} className="px-4 py-2 bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase rounded-xl hover:bg-emerald-200 transition-colors">Mark Paid</button>
                                   )}
                                   <button onClick={() => handleJobClick(job)} className="p-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors"><Eye className="w-4 h-4"/></button>
                               </div>
                           </div>
                       </div>
                   ))}
               </div>
           </div>

           <div className="bg-slate-900 rounded-[2.5rem] border border-slate-800 p-8 text-white relative overflow-hidden shadow-xl">
               <div className="relative z-10">
                   <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                       <h3 className="text-lg font-black uppercase tracking-widest flex items-center gap-2 text-amber-500"><FileText className="w-5 h-5"/> Tax Documents</h3>
                       <select value={taxYear} onChange={e => setTaxYear(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-xs font-black outline-none text-white w-full sm:w-auto">
                           <option value="2024">2024</option>
                           <option value="2025">2025</option>
                           <option value="2026">2026</option>
                           <option value="2027">2027</option>
                       </select>
                   </div>
                   
                   <div className="bg-slate-800/50 border border-slate-700 rounded-[2rem] p-6 mb-8">
                       <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Total {taxYear} Earnings Paid</p>
                       <p className="text-4xl font-black text-white flex items-center"><DollarSign className="w-6 h-6 text-emerald-500"/>{yearlyTotal}</p>
                   </div>

                   {userRole === 'admin' && (
                       <button onClick={() => handleGenerateW9(earningsCleanerFilter, taxYear, yearlyTotal)} className="w-full sm:w-auto px-8 py-4 bg-amber-500 text-slate-900 text-[10px] font-black uppercase tracking-widest rounded-2xl shadow-lg hover:bg-amber-400 transition-colors flex items-center justify-center gap-2">
                           <FileText className="w-4 h-4"/> Generate W-9 Packet
                       </button>
                   )}
               </div>
           </div>
        </div>
    );
  };

  const filteredJobsForList = getFilteredJobsList();
  const visibleProperties = userRole === 'admin' ? properties : properties.filter(p => jobs.some(j => j.propertyId === p.id));

  // --- APP DASHBOARD ---
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 flex flex-col relative pb-10">
      <header className="bg-slate-900 shadow-xl sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex justify-between items-center py-5">
            <div className="flex items-center gap-4">
              <div className="bg-amber-500 p-2.5 rounded-2xl shadow-lg"><Crown className="text-slate-900 w-6 h-6" /></div>
              <div><h1 className="text-xl font-black text-white tracking-tighter uppercase leading-none">Royal Fox</h1><p className="text-amber-500 text-[9px] font-black uppercase tracking-[0.2em] mt-1">{userName}</p></div>
            </div>
            <div className="flex items-center gap-4">
              {userRole === 'admin' && (
                <button onClick={() => setIsAlertsOpen(true)} className="relative text-slate-300 hover:text-white transition-all">
                  <Bell className="w-5 h-5" />
                  {unresolvedAlertsCount > 0 && <span className="absolute -top-1.5 -right-1.5 bg-red-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full border-2 border-slate-900 animate-pulse">{unresolvedAlertsCount}</span>}
                </button>
              )}
              <button onClick={handleLogout} className="bg-slate-800 text-slate-300 px-4 py-2 rounded-xl text-[10px] font-black uppercase border border-slate-700 hover:bg-red-900/40"><LogOut className="w-3.5 h-3.5 inline mr-1" /> Logout</button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-8 w-full animate-in fade-in duration-500">
        <div className="space-y-6">
          
          {userRole === 'admin' ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Command Hub</h2>
                <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
                  <button onClick={() => setIsClearJobsModalOpen(true)} className="flex items-center gap-1.5 bg-white text-red-600 text-[10px] font-black uppercase px-4 py-2.5 rounded-xl border border-red-100 shadow-sm transition-all hover:bg-red-50"><Trash2 className="w-4 h-4" /> Wipe</button>
                  <button onClick={() => setIsAddTeamModalOpen(true)} className="flex items-center gap-2 bg-slate-900 text-white text-[10px] font-black uppercase px-5 py-2.5 rounded-xl shadow-xl transition-all hover:scale-[1.02] active:scale-95"><Plus className="w-4 h-4" /> Cleaner</button>
                  <button onClick={() => setIsAddPropertyModalOpen(true)} className="flex items-center gap-2 bg-slate-900 text-white text-[10px] font-black uppercase px-5 py-2.5 rounded-xl shadow-xl transition-all hover:scale-[1.02] active:scale-95"><Plus className="w-4 h-4" /> Property</button>
                  <button onClick={() => setIsAddModalOpen(true)} className="flex items-center gap-2 bg-indigo-600 text-white text-[10px] font-black uppercase px-5 py-2.5 rounded-xl shadow-xl transition-all hover:scale-[1.02] active:scale-95"><Plus className="w-4 h-4" /> New Job</button>
                </div>
              </div>
              <div className="flex gap-4 border-b border-slate-200 mb-6 overflow-x-auto no-scrollbar">
                <button onClick={() => setOwnerView('schedule')} className={`py-2 text-[10px] font-black uppercase tracking-widest ${ownerView === 'schedule' ? 'text-amber-600 border-b-2 border-amber-600' : 'text-slate-400'}`}>Schedule</button>
                <button onClick={() => setOwnerView('team')} className={`py-2 text-[10px] font-black uppercase tracking-widest ${ownerView === 'team' ? 'text-amber-600 border-b-2 border-amber-600' : 'text-slate-400'}`}>Cleaning Team</button>
                <button onClick={() => setOwnerView('properties')} className={`py-2 text-[10px] font-black uppercase tracking-widest ${ownerView === 'properties' ? 'text-amber-600 border-b-2 border-amber-600' : 'text-slate-400'}`}>Managed Properties</button>
                <button onClick={() => setOwnerView('earnings')} className={`py-2 text-[10px] font-black uppercase tracking-widest ${ownerView === 'earnings' ? 'text-amber-600 border-b-2 border-amber-600' : 'text-slate-400'}`}>Earnings</button>
                <button onClick={() => setOwnerView('issues')} className={`py-2 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 ${ownerView === 'issues' ? 'text-amber-600 border-b-2 border-amber-600' : 'text-slate-400'}`}>
                  Issues {unresolvedAlertsCount > 0 && <span className="bg-red-500 text-white px-1.5 py-0.5 rounded-full text-[8px] leading-none">{unresolvedAlertsCount}</span>}
                </button>
              </div>
              {ownerView === 'schedule' && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                  {['All Teams', ...team.map(t => t.name)].map(tName => (
                    <button key={tName} onClick={() => setOwnerTeamFilter(tName)} className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${ownerTeamFilter === tName ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>{tName}</button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
               <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">My Portal</h2>
              </div>
              <div className="flex gap-4 border-b border-slate-200 mb-6 overflow-x-auto no-scrollbar">
                <button onClick={() => setCleanerView('schedule')} className={`py-2 text-[10px] font-black uppercase tracking-widest ${cleanerView === 'schedule' ? 'text-amber-600 border-b-2 border-amber-600' : 'text-slate-400'}`}>Schedule</button>
                <button onClick={() => setCleanerView('properties')} className={`py-2 text-[10px] font-black uppercase tracking-widest ${cleanerView === 'properties' ? 'text-amber-600 border-b-2 border-amber-600' : 'text-slate-400'}`}>Property Info</button>
                <button onClick={() => setCleanerView('earnings')} className={`py-2 text-[10px] font-black uppercase tracking-widest ${cleanerView === 'earnings' ? 'text-amber-600 border-b-2 border-amber-600' : 'text-slate-400'}`}>Earnings</button>
              </div>
            </>
          )}

          {((userRole === 'admin' && ownerView === 'schedule') || (userRole === 'cleaner' && cleanerView === 'schedule')) && (
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-[2rem] border border-slate-200 shadow-sm">
                <div className="flex gap-2 w-full sm:w-auto overflow-x-auto no-scrollbar">
                    <select value={rangeFilter} onChange={e => setRangeFilter(e.target.value)} className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-[10px] font-black uppercase outline-none focus:ring-1 focus:ring-amber-500 whitespace-nowrap">
                        <option>All Time</option><option>Today</option><option>This Week</option><option>This Month</option>
                    </select>
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-[10px] font-black uppercase outline-none focus:ring-1 focus:ring-amber-500 whitespace-nowrap">
                        <option>All Status</option><option>Scheduled</option><option>Confirmed</option><option>In Progress</option><option>Completed</option><option>Issue</option>
                    </select>
                </div>
                <div className="flex bg-slate-200 p-1 rounded-2xl shadow-inner w-full sm:w-auto">
                    <button onClick={() => setViewMode('list')} className={`flex-1 sm:flex-none px-6 py-2 text-[10px] font-black uppercase rounded-xl transition-all ${viewMode === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>List</button>
                    <button onClick={() => setViewMode('calendar')} className={`flex-1 sm:flex-none px-6 py-2 text-[10px] font-black uppercase rounded-xl transition-all ${viewMode === 'calendar' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Calendar</button>
                </div>
            </div>
          )}

          {(userRole === 'admin' && ownerView === 'earnings') || (userRole === 'cleaner' && cleanerView === 'earnings') ? (
             renderEarningsView()
          ) : userRole === 'admin' && ownerView === 'issues' ? (
             <div className="space-y-4 animate-in fade-in duration-500">
               {alerts.length === 0 ? (
                 <div className="text-center py-32 bg-white rounded-[3rem] border-4 border-dashed border-slate-100 text-slate-200 font-black uppercase tracking-[0.5em] text-sm">No recorded issues</div>
               ) : (
                 alerts.map(a => (
                   <div key={a.id} className={`p-6 bg-white rounded-[2rem] border-2 flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all ${a.resolved ? 'opacity-50 border-slate-100' : 'border-red-100 shadow-md hover:border-red-300'}`}>
                     <div className="flex-1">
                       <div className="flex items-center gap-3 mb-2">
                         <AlertOctagon className={`w-5 h-5 ${a.resolved ? 'text-slate-300' : 'text-red-500'}`} />
                         <span className="font-black text-slate-900 uppercase text-lg tracking-tight leading-none">{getPropertyName(a.propertyId)}</span>
                         {!a.resolved && <span className="bg-red-100 text-red-700 text-[9px] px-2.5 py-1 rounded-full font-black uppercase tracking-widest animate-pulse">Action Needed</span>}
                       </div>
                       <div className="flex items-center gap-2 mb-3">
                         <span className="bg-slate-100 text-slate-600 text-[9px] px-2.5 py-1 rounded-lg font-black uppercase tracking-widest flex items-center gap-1"><User className="w-3 h-3"/> {a.teamName}</span>
                         <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{a.date}</span>
                       </div>
                       <p className="text-sm font-bold text-slate-600 italic leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100">"{a.message}"</p>
                     </div>
                     <div className="flex flex-col gap-2 shrink-0 w-full md:w-auto">
                       {!a.resolved && userRole === 'admin' ? (
                         <button onClick={() => resolveAlert(a.id, a.jobId)} className="w-full md:w-auto px-8 py-4 bg-red-600 text-white font-black uppercase text-[10px] tracking-widest rounded-xl hover:bg-red-500 transition-all shadow-md active:scale-95">Mark Resolved</button>
                       ) : (
                         <span className="w-full md:w-auto px-8 py-4 bg-slate-100 text-slate-400 font-black uppercase text-[10px] tracking-widest rounded-xl text-center border border-slate-200">Resolved</span>
                       )}
                       <div className="flex gap-2 w-full md:w-auto">
                         <button onClick={() => {
                            const job = jobs.find(j => j.id === a.jobId);
                            if (job) { handleJobClick(job); setIsAlertsOpen(false); }
                         }} className="flex-1 px-8 py-4 bg-white text-slate-600 font-black uppercase text-[10px] tracking-widest rounded-xl border border-slate-200 hover:bg-slate-50 transition-all text-center">View Order</button>
                         {userRole === 'admin' && (
                           <button onClick={() => handleDeleteAlert(a.id)} className="p-4 bg-white text-slate-300 hover:text-red-500 rounded-xl border border-slate-200 hover:bg-red-50 transition-colors shrink-0" aria-label="Delete Issue">
                             <Trash2 className="w-4 h-4" />
                           </button>
                         )}
                       </div>
                     </div>
                   </div>
                 ))
               )}
             </div>
          ) : userRole === 'admin' && ownerView === 'team' ? (
             <div className="space-y-8 animate-in fade-in duration-500">
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {team.map((member, idx) => {
                    const assignedJobs = jobs.filter(j => j.assigneeUid === member.uid);
                    const completedJobs = assignedJobs.filter(j => j.status === 'completed');
                    const [y, m] = earningsMonthFilter.split('-');
                    const monthlyRev = completedJobs.filter(j => j.isoDate.startsWith(`${y}-${m}`)).reduce((sum, j) => sum + j.payout, 0);
                    return (
                      <div key={idx} className="bg-white rounded-[2rem] border border-slate-200 shadow-lg relative overflow-hidden flex flex-col group">
                        <div className={`absolute top-0 left-0 w-full h-1.5 ${member.color ? member.color.split(' ')[0] : 'bg-slate-200'}`}></div>
                        <div className="p-8">
                          <div className="flex justify-between items-start mb-8">
                            <div className="flex items-center gap-4">
                                 <div className="w-16 h-16 bg-slate-100 rounded-[1.25rem] flex items-center justify-center text-slate-800 font-black text-2xl border-2 border-white shadow-sm">{member.name.charAt(0)}</div>
                                 <div><h3 className="font-black text-slate-900 text-lg uppercase tracking-tight leading-none">{member.name}</h3><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{member.role}</p></div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => { setEditTeamData(member); setIsEditTeamModalOpen(true); }} className="text-slate-300 hover:text-amber-500 p-2 rounded-xl hover:bg-amber-50 transition-colors" aria-label="Edit Team Member"><Edit className="w-5 h-5" /></button>
                                <button onClick={() => handleDeleteTeam(member.id)} className="text-slate-300 hover:text-red-500 p-2 rounded-xl hover:bg-red-50 transition-colors" aria-label="Delete Team Member"><Trash2 className="w-5 h-5" /></button>
                            </div>
                          </div>
                          <div className="space-y-3 mb-8">
                             <div className="flex justify-between items-center p-3 bg-slate-50 rounded-2xl border border-slate-100"><span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Portfolio</span><span className="font-black text-slate-900">${assignedJobs.reduce((sum, j) => sum + j.payout, 0)}</span></div>
                             <div className="flex justify-between items-center p-3 bg-emerald-50 rounded-2xl border border-emerald-100"><span className="text-[10px] font-black uppercase text-emerald-800 tracking-widest">Earnings (Paid)</span><span className="font-black text-emerald-700">${monthlyRev}</span></div>
                          </div>
                          <div className="bg-slate-900 p-6 rounded-[1.5rem] mt-auto">
                             <div className="flex justify-between items-center mb-4 text-[9px] font-black uppercase text-amber-500"><span>Email Login</span><span className="lowercase text-white opacity-80 font-mono tracking-normal">{member.email || 'N/A'}</span></div>
                             <div className="flex gap-2">
                                <button onClick={() => payTeam(member.uid)} className="flex-1 py-3 rounded-xl bg-emerald-600 text-[9px] font-black uppercase text-white shadow-lg hover:bg-emerald-500">Finalize Pay</button>
                             </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <button onClick={() => setIsAddTeamModalOpen(true)} className="border-4 border-dashed border-slate-200 rounded-[2rem] flex flex-col items-center justify-center p-10 text-slate-300 hover:border-amber-400 transition-all min-h-[350px]"><UserPlus className="w-12 h-12 mb-4" /><span className="font-black uppercase tracking-[0.3em] text-xs">Add Cleaner</span></button>
               </div>
            </div>
          ) : (userRole === 'admin' && ownerView === 'properties') || (userRole === 'cleaner' && cleanerView === 'properties') ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 animate-in fade-in duration-500">
              {visibleProperties.map((prop, idx) => (
                <div key={idx} className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-lg flex flex-col hover:border-amber-400 transition-all">
                  <div className="flex justify-between items-start mb-6">
                    <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 border border-amber-100 shadow-sm"><Home className="w-6 h-6" /></div>
                    <div className="flex items-center gap-2">
                      <span className="bg-slate-100 text-slate-600 text-[10px] font-black uppercase px-3 py-1.5 rounded-xl border border-slate-200">{prop.propertyType}</span>
                      {userRole === 'admin' && (
                        <>
                          <button onClick={() => { setEditPropertyData(prop); setIsEditPropertyModalOpen(true); }} className="text-slate-300 hover:text-amber-500 p-2 rounded-xl hover:bg-amber-50 transition-colors" aria-label="Edit Property"><Edit className="w-5 h-5" /></button>
                          <button onClick={() => handleDeleteProperty(prop.id)} className="text-slate-300 hover:text-red-500 p-2 rounded-xl hover:bg-red-50 transition-colors" aria-label="Delete Property"><Trash2 className="w-5 h-5" /></button>
                        </>
                      )}
                    </div>
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tighter mb-2 leading-none">{prop.name}</h3>
                  <p className="text-sm text-slate-400 flex items-center gap-1.5 mb-8"><MapPin className="w-4 h-4 text-slate-300" /> {prop.address}</p>
                  <div className="grid grid-cols-3 gap-3 mb-8">
                    <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 flex flex-col items-center"><Bed className="w-5 h-5 text-slate-400 mb-1" /><span className="font-black text-slate-800">{prop.bedrooms || '-'}</span></div>
                    <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 flex flex-col items-center"><Bath className="w-5 h-5 text-slate-400 mb-1" /><span className="font-black text-slate-800">{prop.bathrooms || '-'}</span></div>
                    <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 flex flex-col items-center"><Maximize className="w-5 h-5 text-slate-400 mb-1" /><span className="font-black text-slate-800 text-[10px] whitespace-nowrap uppercase tracking-tighter">{prop.squareFootage ? `${prop.squareFootage} FT` : '-'}</span></div>
                  </div>
                  <div className="mt-auto pt-6 border-t border-slate-100 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Key className="w-5 h-5 text-amber-500" />
                      <span className="text-lg font-mono font-black text-slate-900 tracking-widest">{prop.accessCode || "NONE"}</span>
                    </div>
                    {prop.icalLink && (
                      <button onClick={() => openIcalModal(prop)} className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-blue-500 bg-blue-50 hover:bg-blue-100 hover:text-blue-600 px-2 py-1 rounded-lg border border-blue-200 transition-colors shadow-sm cursor-pointer" title="View Availability Calendar">
                        <CalendarIcon className="w-3 h-3"/> View Sync
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {userRole === 'admin' && (
                  <button onClick={() => setIsAddPropertyModalOpen(true)} className="border-4 border-dashed border-slate-200 rounded-[2.5rem] p-10 text-slate-300 hover:border-amber-400 hover:text-amber-500 transition-all flex flex-col items-center justify-center min-h-[350px]"><Plus className="w-12 h-12 mb-4" /><span className="font-black uppercase tracking-[0.4em] text-[10px]">Register Property</span></button>
              )}
            </div>
          ) : viewMode === 'list' ? (
            <div className="space-y-6 animate-in fade-in duration-500">
              {filteredJobsForList.map((job) => (
                <div key={job.id} onClick={() => handleJobClick(job)} className={`bg-white rounded-[2rem] border-2 p-0 overflow-hidden shadow-lg transition-all duration-300 hover:shadow-xl cursor-pointer hover:border-amber-300 ${job.status === 'completed' ? 'border-slate-100 opacity-80 scale-[0.98]' : 'border-slate-100'}`}>
                  <div className="bg-slate-50 border-b border-slate-100 px-8 py-4 flex justify-between items-center">
                    <span className="font-black text-slate-400 uppercase text-[10px] tracking-[0.2em]">{job.date}</span>
                    <div className="flex items-center gap-3">{job.paid && <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase px-2 py-1 rounded-lg border border-emerald-200">Paid</span>}{getStatusBadge(job.status)}</div>
                  </div>
                  <div className="p-8 flex flex-col md:flex-row md:items-center justify-between gap-8">
                    <div className="flex-1">
                      <h3 className={`text-3xl font-black tracking-tighter ${job.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{getPropertyName(job.propertyId)}</h3>
                      <div className="flex items-center gap-3 mt-3">
                        <span className="bg-slate-900 text-white text-[9px] px-3 py-1 rounded-full font-black uppercase tracking-widest">{job.type}</span>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter flex items-center gap-1"><Clock className="w-3 h-3"/> {job.checkOut} — {job.checkIn}</span>
                        {userRole === 'admin' && <span className="flex items-center gap-1.5 text-xs text-slate-300 font-bold"><Users className="w-4 h-4 text-slate-200" /> {job.assigneeName}</span>}
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center gap-6"><div className={`flex items-center gap-1 text-2xl font-black ${job.paid ? 'text-slate-300' : 'text-emerald-600'}`}><DollarSign className="w-7 h-7" />{job.payout}</div>{getActionButton(job)}</div>
                  </div>
                </div>
              ))}
              {filteredJobsForList.length === 0 && <div className="text-center py-32 bg-white rounded-[3rem] border-4 border-dashed border-slate-100 text-slate-200 font-black uppercase tracking-[0.5em] text-sm">No work orders found</div>}
            </div>
          ) : renderCalendarView()}
        </div>
      </main>

      {/* --- MODALS --- */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-white rounded-[2.5rem] max-w-xl w-full shadow-2xl flex flex-col overflow-hidden animate-in zoom-in duration-300">
            <div className="flex justify-between items-center p-8 border-b bg-slate-50"><h2 className="text-2xl font-black uppercase tracking-tight text-slate-900">New Order</h2><button onClick={() => setIsAddModalOpen(false)} className="p-2 bg-white rounded-full border shadow-sm"><X className="w-8 h-8 text-slate-400" /></button></div>
            <form onSubmit={handleAddJobSubmit} className="p-10 space-y-6 overflow-y-auto max-h-[80vh]">
              <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Property</label>
                <select value={newJob.propertyId} onChange={(e) => setNewJob({...newJob, propertyId: e.target.value})} className="w-full bg-slate-100 border-none p-4 rounded-2xl font-black appearance-none" required><option value="">Select Target...</option>{properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Job Date</label><input type="date" value={newJob.date} onChange={(e) => setNewJob({...newJob, date: e.target.value})} className="w-full bg-slate-100 border-none p-4 rounded-2xl font-black" required /></div>
                <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Assign Cleaner</label><select value={newJob.assigneeUid} onChange={(e) => setNewJob({...newJob, assigneeUid: e.target.value})} className="w-full bg-slate-100 border-none p-4 rounded-2xl font-black appearance-none"><option value="">Unassigned</option>{team.map(t => <option key={t.uid} value={t.uid}>{t.name}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Start time</label><input type="text" placeholder="11:00 AM" value={newJob.startTime} onChange={(e) => setNewJob({...newJob, startTime: e.target.value})} className="w-full bg-slate-100 border-none p-4 rounded-2xl font-black" /></div>
                <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Needs done by</label><input type="text" placeholder="4:00 PM" value={newJob.endTime} onChange={(e) => setNewJob({...newJob, endTime: e.target.value})} className="w-full bg-slate-100 border-none p-4 rounded-2xl font-black" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Fee ($)</label><input type="number" value={newJob.payout} onChange={(e) => setNewJob({...newJob, payout: e.target.value})} className="w-full bg-slate-100 border-none p-4 rounded-2xl font-black" /></div>
                <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Type</label><select value={newJob.type} onChange={(e) => setNewJob({...newJob, type: e.target.value})} className="w-full bg-slate-100 border-none p-4 rounded-2xl font-black appearance-none"><option value="Turnaround">Turnover</option><option value="Deep Clean">Deep Clean</option><option value="Standard">Standard</option></select></div>
              </div>
              <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Notes</label><textarea value={newJob.notes} onChange={(e) => setNewJob({...newJob, notes: e.target.value})} className="w-full bg-slate-100 border-none p-4 rounded-2xl font-black h-24" /></div>
              
              <div className="space-y-3 pt-2">
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Custom Checklist</label>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-2 no-scrollbar">
                  {newJob.checklist.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                      <CheckSquare className="w-4 h-4 text-slate-300 shrink-0" />
                      <span className="flex-1 text-xs font-bold text-slate-700 leading-tight">{item.task}</span>
                      <button type="button" onClick={() => {
                        const newCl = [...newJob.checklist];
                        newCl.splice(idx, 1);
                        setNewJob({...newJob, checklist: newCl});
                      }} className="text-slate-400 hover:text-red-500 p-1 bg-white rounded-lg shadow-sm border border-slate-100"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input type="text" id="newChecklistItem" placeholder="Type a custom task..." className="flex-1 bg-slate-100 border-none p-4 rounded-2xl font-black text-sm" onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                          e.preventDefault();
                          if (!e.target.value.trim()) return;
                          setNewJob({...newJob, checklist: [...newJob.checklist, { task: e.target.value.trim(), done: false }]});
                          e.target.value = '';
                      }
                  }} />
                  <button type="button" onClick={() => {
                      const input = document.getElementById('newChecklistItem');
                      if (!input.value.trim()) return;
                      setNewJob({...newJob, checklist: [...newJob.checklist, { task: input.value.trim(), done: false }]});
                      input.value = '';
                  }} className="bg-slate-900 text-white px-6 rounded-2xl font-black text-[10px] uppercase hover:bg-slate-800 transition-colors">Add</button>
                </div>
              </div>

              <button type="submit" className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl shadow-xl mt-4 uppercase tracking-[0.2em] transition-all hover:bg-slate-800">Schedule Work Order</button>
            </form>
          </div>
        </div>
      )}

      {/* --- ADD CLEANER MODAL --- */}
      {isAddTeamModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-white rounded-[2.5rem] max-w-xl w-full shadow-2xl flex flex-col overflow-hidden animate-in zoom-in duration-300">
            <div className="flex justify-between items-center p-8 border-b bg-slate-50">
              <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900">Add Cleaner</h2>
              <button onClick={resetAddCleanerModal} className="p-2 bg-white rounded-full border shadow-sm"><X className="w-8 h-8 text-slate-400" /></button>
            </div>
            <div className="p-10 overflow-y-auto max-h-[80vh]">
                <form onSubmit={handleAddTeamSubmit} className="space-y-6">
                  {addCleanerError && <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-red-100">{addCleanerError}</div>}
                  <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Full Name</label><input type="text" value={newTeam.name} onChange={(e) => setNewTeam({...newTeam, name: e.target.value})} required className="w-full bg-slate-100 border-none p-4 rounded-2xl font-black" /></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Login Email</label><input type="email" value={newTeam.email} onChange={(e) => setNewTeam({...newTeam, email: e.target.value})} required className="w-full bg-slate-100 border-none p-4 rounded-2xl font-black" placeholder="name@email.com" /></div>
                    <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Password</label><input type="text" value={newTeam.password} onChange={(e) => setNewTeam({...newTeam, password: e.target.value})} required minLength="6" className="w-full bg-slate-100 border-none p-4 rounded-2xl font-black" placeholder="Set password" /></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Role/Title (Optional)</label><input type="text" value={newTeam.role} onChange={(e) => setNewTeam({...newTeam, role: e.target.value})} className="w-full bg-slate-100 border-none p-4 rounded-2xl font-black" placeholder="Detailing Specialist" /></div>
                    <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Phone Number</label><input type="text" value={newTeam.phone} onChange={(e) => setNewTeam({...newTeam, phone: e.target.value})} className="w-full bg-slate-100 border-none p-4 rounded-2xl font-black" placeholder="(555) 000-0000" /></div>
                  </div>
                  <button type="submit" className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl shadow-xl mt-4 uppercase tracking-[0.2em] transition-all hover:bg-slate-800">Register Cleaner</button>
                </form>
            </div>
          </div>
        </div>
      )}

      {/* --- EDIT CLEANER MODAL --- */}
      {isEditTeamModalOpen && editTeamData && (
        <div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-white rounded-[2.5rem] max-w-xl w-full shadow-2xl flex flex-col overflow-hidden animate-in zoom-in duration-300">
            <div className="flex justify-between items-center p-8 border-b bg-slate-50">
              <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900">Edit Cleaner</h2>
              <button onClick={() => { setIsEditTeamModalOpen(false); setEditTeamData(null); }} className="p-2 bg-white rounded-full border shadow-sm"><X className="w-8 h-8 text-slate-400" /></button>
            </div>
            <div className="p-10 overflow-y-auto max-h-[80vh]">
                <form onSubmit={handleUpdateTeamSubmit} className="space-y-6">
                  <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Full Name</label><input type="text" value={editTeamData.name} onChange={(e) => setEditTeamData({...editTeamData, name: e.target.value})} required className="w-full bg-slate-100 border-none p-4 rounded-2xl font-black" /></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Role/Title</label><input type="text" value={editTeamData.role} onChange={(e) => setEditTeamData({...editTeamData, role: e.target.value})} className="w-full bg-slate-100 border-none p-4 rounded-2xl font-black" placeholder="Detailing Specialist" /></div>
                    <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Phone Number</label><input type="text" value={editTeamData.phone} onChange={(e) => setEditTeamData({...editTeamData, phone: e.target.value})} className="w-full bg-slate-100 border-none p-4 rounded-2xl font-black" placeholder="(555) 000-0000" /></div>
                  </div>
                  <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 ml-1 tracking-widest">Login Email</label><input type="email" value={editTeamData.email} disabled className="w-full bg-slate-200 text-slate-400 border-none p-4 rounded-2xl font-black cursor-not-allowed" /></div>
                  <button type="submit" className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl shadow-xl mt-4 uppercase tracking-[0.2em] transition-all hover:bg-slate-800">Save Changes</button>
                </form>
            </div>
          </div>
        </div>
      )}

      {isAddPropertyModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[3rem] max-md:w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-8 border-b bg-slate-50"><h2 className="text-2xl font-black text-slate-900 uppercase">Register Property</h2><button onClick={() => setIsAddPropertyModalOpen(false)}><X className="w-6 h-6" /></button></div>
            <form onSubmit={handleAddPropertySubmit} className="p-8 space-y-6 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input type="text" value={newProperty.name} onChange={(e) => setNewProperty({...newProperty, name: e.target.value})} required className="w-full bg-slate-50 border p-3 rounded-xl font-bold" placeholder="Property Name" />
                <select value={newProperty.propertyType} onChange={(e) => setNewProperty({...newProperty, propertyType: e.target.value})} className="w-full bg-slate-50 border p-3 rounded-xl font-bold appearance-none">
                    {propertyTypeOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <input type="text" value={newProperty.address} onChange={(e) => setNewProperty({...newProperty, address: e.target.value})} required className="w-full bg-slate-50 border p-3 rounded-xl font-bold" placeholder="Address" />
              <div className="grid grid-cols-3 gap-4">
                <input type="number" value={newProperty.bedrooms} onChange={(e) => setNewProperty({...newProperty, bedrooms: e.target.value})} className="w-full bg-slate-50 border p-3 rounded-xl font-bold" placeholder="Beds" />
                <input type="number" step="0.5" value={newProperty.bathrooms} onChange={(e) => setNewProperty({...newProperty, bathrooms: e.target.value})} className="w-full bg-slate-50 border p-3 rounded-xl font-bold" placeholder="Baths" />
                <input type="number" value={newProperty.squareFootage} onChange={(e) => setNewProperty({...newProperty, squareFootage: e.target.value})} className="w-full bg-slate-50 border p-3 rounded-xl font-bold" placeholder="Sqft" />
              </div>
              <input type="text" value={newProperty.accessCode} onChange={(e) => setNewProperty({...newProperty, accessCode: e.target.value})} className="w-full bg-slate-50 border p-3 rounded-xl font-bold" placeholder="Access Code" />
              <input type="url" value={newProperty.icalLink || ''} onChange={(e) => setNewProperty({...newProperty, icalLink: e.target.value})} className="w-full bg-slate-50 border p-3 rounded-xl font-bold" placeholder="iCal URL (from Airbnb/VRBO)" />
              <button type="submit" className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl shadow-xl mt-4 uppercase tracking-widest">Save Property</button>
            </form>
          </div>
        </div>
      )}

      {/* --- EDIT PROPERTY MODAL --- */}
      {isEditPropertyModalOpen && editPropertyData && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[3rem] max-md:w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in duration-300">
            <div className="flex justify-between items-center p-8 border-b bg-slate-50"><h2 className="text-2xl font-black text-slate-900 uppercase">Edit Property</h2><button onClick={() => { setIsEditPropertyModalOpen(false); setEditPropertyData(null); }}><X className="w-6 h-6" /></button></div>
            <form onSubmit={handleUpdatePropertySubmit} className="p-8 space-y-6 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input type="text" value={editPropertyData.name} onChange={(e) => setEditPropertyData({...editPropertyData, name: e.target.value})} required className="w-full bg-slate-50 border p-3 rounded-xl font-bold" placeholder="Property Name" />
                <select value={editPropertyData.propertyType} onChange={(e) => setEditPropertyData({...editPropertyData, propertyType: e.target.value})} className="w-full bg-slate-50 border p-3 rounded-xl font-bold appearance-none">
                    {propertyTypeOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <input type="text" value={editPropertyData.address} onChange={(e) => setEditPropertyData({...editPropertyData, address: e.target.value})} required className="w-full bg-slate-50 border p-3 rounded-xl font-bold" placeholder="Address" />
              <div className="grid grid-cols-3 gap-4">
                <input type="number" value={editPropertyData.bedrooms} onChange={(e) => setEditPropertyData({...editPropertyData, bedrooms: e.target.value})} className="w-full bg-slate-50 border p-3 rounded-xl font-bold" placeholder="Beds" />
                <input type="number" step="0.5" value={editPropertyData.bathrooms} onChange={(e) => setEditPropertyData({...editPropertyData, bathrooms: e.target.value})} className="w-full bg-slate-50 border p-3 rounded-xl font-bold" placeholder="Baths" />
                <input type="number" value={editPropertyData.squareFootage} onChange={(e) => setEditPropertyData({...editPropertyData, squareFootage: e.target.value})} className="w-full bg-slate-50 border p-3 rounded-xl font-bold" placeholder="Sqft" />
              </div>
              <input type="text" value={editPropertyData.accessCode} onChange={(e) => setEditPropertyData({...editPropertyData, accessCode: e.target.value})} className="w-full bg-slate-50 border p-3 rounded-xl font-bold" placeholder="Access Code" />
              <input type="url" value={editPropertyData.icalLink || ''} onChange={(e) => setEditPropertyData({...editPropertyData, icalLink: e.target.value})} className="w-full bg-slate-50 border p-3 rounded-xl font-bold" placeholder="iCal URL (from Airbnb/VRBO)" />
              <button type="submit" className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl shadow-xl mt-4 uppercase tracking-widest">Save Changes</button>
            </form>
          </div>
        </div>
      )}

      {/* --- ICAL SYNC CALENDAR MODAL --- */}
      {isIcalModalOpen && selectedIcalProperty && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsIcalModalOpen(false)}>
            <div className="bg-white rounded-[3rem] max-w-3xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in duration-300" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-8 border-b bg-slate-50">
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none">{selectedIcalProperty.name}</h2>
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mt-2">Live Availability Sync</p>
                    </div>
                    <button onClick={() => setIsIcalModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="w-6 h-6" /></button>
                </div>
                
                <div className="p-8 flex-1 overflow-y-auto bg-white">
                    {icalLoading ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
                            <p className="text-xs font-black uppercase tracking-widest text-slate-400">Fetching live calendar...</p>
                        </div>
                    ) : (
                        <div>
                            <div className="flex justify-between items-center mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <button onClick={() => setCurrentIcalMonth(new Date(currentIcalMonth.getFullYear(), currentIcalMonth.getMonth() - 1, 1))} className="p-2 hover:bg-white rounded-xl shadow-sm transition-all border border-slate-200"><ChevronLeft className="w-4 h-4 text-slate-600" /></button>
                                <h3 className="text-base font-black text-slate-900 uppercase tracking-widest leading-none">
                                    {currentIcalMonth.toLocaleDateString('default', { month: 'long', year: 'numeric' })}
                                </h3>
                                <button onClick={() => setCurrentIcalMonth(new Date(currentIcalMonth.getFullYear(), currentIcalMonth.getMonth() + 1, 1))} className="p-2 hover:bg-white rounded-xl shadow-sm transition-all border border-slate-200"><ChevronRight className="w-4 h-4 text-slate-600" /></button>
                            </div>
                            
                            <div className="grid grid-cols-7 gap-2 mb-2">
                                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <div key={d} className="py-2 text-center text-[9px] font-black text-slate-400 uppercase tracking-widest">{d}</div>)}
                            </div>
                            
                            <div className="grid grid-cols-7 gap-2">
                                {Array.from({ length: new Date(currentIcalMonth.getFullYear(), currentIcalMonth.getMonth(), 1).getDay() }).map((_, i) => (
                                    <div key={`empty-${i}`} className="aspect-square rounded-2xl bg-slate-50/50"></div>
                                ))}
                                
                                {Array.from({ length: new Date(currentIcalMonth.getFullYear(), currentIcalMonth.getMonth() + 1, 0).getDate() }).map((_, i) => {
                                    const day = i + 1;
                                    const currentDateTimestamp = new Date(currentIcalMonth.getFullYear(), currentIcalMonth.getMonth(), day).getTime();
                                    
                                    const booking = icalEvents.find(e => currentDateTimestamp >= e.start.getTime() && currentDateTimestamp < e.end.getTime());
                                    const isBooked = !!booking;
                                    
                                    return (
                                        <div key={day} className={`aspect-square rounded-2xl p-2 flex flex-col justify-between border ${isBooked ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100'} transition-all`}>
                                            <span className={`text-[10px] font-black ${isBooked ? 'text-red-700' : 'text-emerald-700'}`}>{day}</span>
                                            {isBooked ? (
                                                <span className="text-[8px] font-black uppercase text-red-500 tracking-tighter leading-none bg-white/50 p-1 rounded-md mt-auto truncate" title={booking.summary || 'Booked'}>Booked</span>
                                            ) : (
                                                <span className="text-[8px] font-black uppercase text-emerald-500 tracking-tighter leading-none bg-white/50 p-1 rounded-md mt-auto truncate">Open</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="mt-8 flex gap-4 text-[10px] font-black uppercase tracking-widest justify-center">
                                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-400"></div> Open</div>
                                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-400"></div> Booked</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}

      {/* --- JOB DETAIL & EDIT MODAL --- */}
      {selectedJob && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={closeJobModal}>
          <div className="bg-white rounded-[3rem] max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-10 border-b bg-slate-50 flex justify-between items-start">
              <div>
                {getStatusBadge(selectedJob.status)}
                <h2 className="text-3xl font-black text-slate-900 mt-2 tracking-tighter leading-none">{getPropertyName(selectedJob.propertyId)}</h2>
                <div className="mt-4 text-slate-900 bg-white border px-4 py-3 rounded-2xl text-sm font-black flex items-center gap-2 shadow-sm w-fit">
                  <Key className="w-5 h-5 text-amber-500"/> CODE: {getPropertyAccessCode(selectedJob.propertyId)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {userRole === 'admin' && (
                  <button onClick={() => handleDeleteJob(selectedJob.id)} className="text-slate-300 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition-colors" aria-label="Delete Work Order"><Trash2 className="w-6 h-6" /></button>
                )}
                <button onClick={closeJobModal} className="text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-100 transition-colors"><X className="w-8 h-8" /></button>
              </div>
            </div>
            
            <div className="p-10 overflow-y-auto bg-white flex-1 space-y-10">
              
              {/* EDIT MODE TOGGLE OR VIEW */}
              {isEditMode ? (
                <form onSubmit={handleUpdateJobSubmit} className="bg-amber-50/80 p-5 rounded-3xl border border-amber-200 space-y-3 animate-in fade-in">
                    <h3 className="font-black text-amber-800 uppercase text-[10px] tracking-[0.2em] mb-2 flex items-center gap-2">
                      <Edit className="w-3.5 h-3.5" /> Quick Edit
                    </h3>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-[9px] font-black uppercase text-amber-700/70 ml-1 tracking-widest">Date</label>
                            <input type="date" value={editJobData.isoDate || ''} onChange={e => {
                                 const [year, month, day] = e.target.value.split('-');
                                 const dateObj = new Date(year, month - 1, day);
                                 const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
                                 const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                                 const formattedDate = `${dayNames[dateObj.getDay()]}, ${monthNames[dateObj.getMonth()]} ${dateObj.getDate()}`;
                                 setEditJobData({...editJobData, isoDate: e.target.value, date: formattedDate});
                            }} className="w-full bg-white border border-amber-200 px-3 py-2 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all" required />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[9px] font-black uppercase text-amber-700/70 ml-1 tracking-widest">Cleaner</label>
                            <select value={editJobData.assigneeUid || ''} onChange={e => {
                                const assignedTeam = team.find(t => t.uid === e.target.value);
                                setEditJobData({...editJobData, assigneeUid: e.target.value, assigneeName: assignedTeam ? assignedTeam.name : 'Unassigned'});
                            }} className="w-full bg-white border border-amber-200 px-3 py-2 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all appearance-none">
                                <option value="unassigned">Unassigned</option>
                                {team.map(t => <option key={t.uid} value={t.uid}>{t.name}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                             <label className="text-[9px] font-black uppercase text-amber-700/70 ml-1 tracking-widest">Start Time</label>
                             <input type="text" value={editJobData.checkOut || ''} onChange={e => setEditJobData({...editJobData, checkOut: e.target.value})} className="w-full bg-white border border-amber-200 px-3 py-2 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all" />
                        </div>
                        <div className="space-y-1">
                             <label className="text-[9px] font-black uppercase text-amber-700/70 ml-1 tracking-widest">End Time</label>
                             <input type="text" value={editJobData.checkIn || ''} onChange={e => setEditJobData({...editJobData, checkIn: e.target.value})} className="w-full bg-white border border-amber-200 px-3 py-2 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                         <div className="space-y-1">
                             <label className="text-[9px] font-black uppercase text-amber-700/70 ml-1 tracking-widest">Payout ($)</label>
                             <input type="number" value={editJobData.payout || 0} onChange={e => setEditJobData({...editJobData, payout: Number(e.target.value)})} className="w-full bg-white border border-amber-200 px-3 py-2 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all" />
                        </div>
                        <div className="space-y-1">
                             <label className="text-[9px] font-black uppercase text-amber-700/70 ml-1 tracking-widest">Type</label>
                             <select value={editJobData.type || ''} onChange={e => setEditJobData({...editJobData, type: e.target.value})} className="w-full bg-white border border-amber-200 px-3 py-2 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all appearance-none">
                                 <option value="Turnaround">Turnover</option>
                                 <option value="Deep Clean">Deep Clean</option>
                                 <option value="Standard">Standard</option>
                             </select>
                        </div>
                    </div>

                    <div className="space-y-1">
                         <label className="text-[9px] font-black uppercase text-amber-700/70 ml-1 tracking-widest">Notes</label>
                         <textarea value={editJobData.notes || ''} onChange={e => setEditJobData({...editJobData, notes: e.target.value})} className="w-full bg-white border border-amber-200 px-3 py-2 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all h-16 resize-none" />
                    </div>

                    <div className="flex gap-2 pt-1">
                        <button type="button" onClick={() => setIsEditMode(false)} className="flex-1 bg-white text-amber-700 font-black py-3 rounded-xl border border-amber-200 uppercase text-[10px] hover:bg-amber-50 transition-colors">Cancel</button>
                        <button type="submit" className="flex-[2] bg-amber-600 text-white font-black py-3 rounded-xl shadow-md hover:bg-amber-500 uppercase text-[10px] transition-colors">Save Updates</button>
                    </div>
                </form>
              ) : (
                <div className="flex flex-col gap-4">
                  {userRole === 'admin' ? (
                      <button onClick={() => { setEditJobData(selectedJob); setIsEditMode(true); }} className="w-full py-5 bg-amber-50 text-amber-700 font-black uppercase text-xs border border-amber-100 rounded-3xl transition-all hover:bg-amber-100">Manage Order</button>
                  ) : (
                      <button onClick={() => setIsReportingIssue(true)} className="w-full py-5 bg-red-50 text-red-700 font-black uppercase text-xs border border-red-100 rounded-3xl">Report Issue</button>
                  )}
                  {selectedJob.notes && <div className="bg-slate-50 p-6 rounded-3xl border italic text-sm text-slate-600 font-medium">"{selectedJob.notes}"</div>}
                </div>
              )}
              
              {/* ISSUE REPORTING UI */}
              {isReportingIssue && (
                <div className="bg-red-50 p-6 rounded-[2.5rem] border-2 border-red-100 space-y-4 animate-in fade-in">
                    <h3 className="font-black text-red-700 uppercase text-xs tracking-widest">Record an issue</h3>
                    <textarea value={issueText} onChange={(e) => setIssueText(e.target.value)} className="w-full bg-white border-2 border-red-100 rounded-2xl p-4 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-red-500" placeholder="What is broken, damaged, or missing?" rows="3" />
                    <div className="flex gap-2">
                        <button onClick={submitIssue} className="flex-1 bg-red-600 text-white font-black py-4 rounded-xl shadow-lg uppercase text-[10px]">Send report</button>
                        <button type="button" onClick={() => setIsReportingIssue(false)} className="flex-1 bg-white text-red-600 font-black py-4 rounded-xl border border-red-200 uppercase text-[10px]">Cancel</button>
                    </div>
                </div>
              )}

              {/* PHOTO UPLOAD & DISPLAY */}
              <div>
                <h3 className="font-black uppercase tracking-widest text-[10px] text-slate-400 mb-6 flex items-center gap-2">
                   <Camera className="w-5 h-5 text-amber-500"/> Documentation
                </h3>
                
                {selectedJob.photos && selectedJob.photos.length > 0 && (
                   <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                      {selectedJob.photos.map((url, i) => (
                         <div key={i} className="relative block w-full h-28 rounded-2xl overflow-hidden border border-slate-200 shadow-sm hover:border-amber-400 transition-all group">
                            <a href={url} target="_blank" rel="noreferrer" className="block w-full h-full">
                               <img src={url} alt={`Documentation ${i+1}`} className="w-full h-full object-cover" />
                            </a>
                            <button type="button" onClick={(e) => handleDeletePhoto(e, url)} className="absolute top-2 right-2 bg-white/90 hover:bg-red-500 text-slate-700 hover:text-white p-1.5 rounded-full backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all shadow-sm" aria-label="Delete Photo">
                               <X className="w-3.5 h-3.5" />
                            </button>
                         </div>
                      ))}
                   </div>
                )}

                <label className="bg-red-50 p-10 rounded-[2.5rem] border-2 border-dashed border-red-100 text-center cursor-pointer hover:bg-white transition-all block">
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={isUploading} />
                  {isUploading ? (
                     <Loader2 className="w-6 h-6 text-red-300 mx-auto mb-2 animate-spin" />
                  ) : (
                     <Camera className="w-6 h-6 text-red-200 mx-auto mb-2" />
                  )}
                  <p className="text-[10px] font-black uppercase text-red-300">
                     {isUploading ? 'Uploading Image...' : 'Tap to upload issue photos'}
                  </p>
                  {uploadError && <p className="text-[9px] font-black text-red-500 mt-2 uppercase">{uploadError}</p>}
                </label>
              </div>

              {/* CHECKLIST */}
              <div>
                <h3 className="font-black uppercase tracking-widest text-[10px] text-slate-400 mb-6">Task checklist</h3>
                <div className="space-y-3">
                    {selectedJob.checklist.map((item, idx) => (
                        <label key={idx} className={`flex items-start gap-5 p-5 rounded-3xl border-2 cursor-pointer transition-all ${item.done ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-100 shadow-sm'}`}>
                            <input type="checkbox" checked={item.done} onChange={() => toggleChecklistItem(selectedJob.id, idx)} className="mt-1 w-7 h-7 rounded-xl border-2 text-amber-500 focus:ring-amber-500"/>
                            <span className={`font-black text-base ${item.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{item.task}</span>
                        </label>
                    ))}
                </div>
              </div>

            </div>
            <div className="p-10 border-t bg-slate-50 flex justify-between items-center"><div className="font-black text-slate-900 text-3xl flex items-center tracking-tighter leading-none"><DollarSign className="w-8 h-8 text-emerald-500"/>{selectedJob.payout}</div>{getActionButton(selectedJob)}</div>
          </div>
        </div>
      )}

      {/* --- WIPE MODAL --- */}
      {isClearJobsModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsClearJobsModalOpen(false)}>
          <div className="bg-white rounded-3xl max-sm:w-full max-w-sm shadow-2xl p-10 text-center" onClick={e => e.stopPropagation()}><div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 border-8 border-red-50"><AlertTriangle className="w-8 h-8" /></div><h2 className="text-xl font-bold text-slate-900 text-center mb-2 uppercase">Wipe Schedule?</h2><p className="text-sm text-slate-500 mb-8 font-bold">Permanently delete current assignments?</p><div className="flex gap-4"><button type="button" onClick={() => setIsClearJobsModalOpen(false)} className="flex-1 bg-slate-100 font-black py-4 rounded-xl transition-all uppercase text-[10px]">Cancel</button><button type="button" onClick={handleClearAllJobs} className="flex-1 bg-red-600 text-white font-black py-4 rounded-xl shadow-lg uppercase text-[10px]">Confirm</button></div></div>
        </div>
      )}

      {/* ALERTS MODAL */}
      {isAlertsOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsAlertsOpen(false)}>
          <div className="bg-white rounded-[2rem] max-w-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-8 border-b bg-slate-50 font-black uppercase text-xs tracking-widest"><h2>Active Alerts</h2><button onClick={() => setIsAlertsOpen(false)}><X className="w-6 h-6"/></button></div>
            <div className="p-6 space-y-4 overflow-y-auto">
              {alerts.length === 0 ? <p className="text-center text-slate-400 py-16 font-bold uppercase tracking-widest text-[10px]">No active issues</p> : alerts.map(a => (<div key={a.id} className={`p-5 rounded-2xl border-2 ${a.resolved ? 'opacity-40 bg-slate-50 border-slate-100 shadow-none' : 'bg-red-50 border-red-100 shadow-sm'}`}><div className="flex justify-between items-start mb-3"><span className="font-black text-slate-900 uppercase text-xs">{getPropertyName(a.propertyId)}</span><div className="flex items-center gap-2">{!a.resolved && userRole === 'admin' && <button type="button" onClick={() => resolveAlert(a.id, a.jobId)} className="text-[10px] font-black text-red-600 uppercase border-2 border-red-200 px-3 py-1 rounded-xl transition-all hover:bg-white">Clear</button>}{userRole === 'admin' && <button type="button" onClick={() => handleDeleteAlert(a.id)} className="text-slate-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors"><Trash2 className="w-4 h-4" /></button>}</div></div><p className="text-sm font-bold text-slate-600 italic leading-relaxed">"{a.message}"</p></div>))}</div>
          </div>
        </div>
      )}
      
      <footer className="mt-20 text-center text-[10px] text-slate-300 uppercase tracking-[0.5em] font-black py-10">Royal Fox Operations Hub v4.18</footer>
    </div>
  );
}