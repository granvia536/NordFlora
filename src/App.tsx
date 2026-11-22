import React, {useEffect, useState} from 'react';
import {User, GoogleAuthProvider, onAuthStateChanged, signInWithCredential, signInWithPopup, signOut} from 'firebase/auth';
import {Capacitor} from '@capacitor/core';
import {FirebaseAuthentication} from '@capacitor-firebase/authentication';
import {
  Droplets,
  LayoutGrid,
  LogOut,
  Plus,
  Smartphone,
  Sun,
  Thermometer,
} from 'lucide-react';
import {ErrorBoundary} from './components/ErrorBoundary';
import {OfflineIndicator} from './components/OfflineIndicator';
import {PWAInstallButton} from './components/PWAInstallButton';
import {WidgetHomeView} from './components/WidgetHomeView';
import {CollectionPage} from './components/CollectionPage';
import {ClimateView} from './components/ClimateView';
import {LuxMeterView} from './components/LuxMeterView';
import {PlantFormModal} from './components/PlantFormModal';
import {PlantDetailModal} from './components/PlantDetailModal';
import {auth, googleProvider} from './firebase';
import {
  SaveMonthlyTempInput,
  SavePlantInput,
  createPlant,
  deletePlant,
  markPlantWatered,
  recordPlantLux,
  saveMonthlyTemp,
  subscribeMonthlyTemps,
  subscribePlants,
  updatePlantDetails,
  updatePlantPhotoAndCare,
} from './lib/firestoreService';
import {
  getBarcelonaPeakWindow,
  getCurrentMonthKey,
  getPlantAverageLuxStats,
} from './lib/botanicalEngine';
import {AppView, LuxSource, MonthlyTemp, PlantLookupResult, PlantRecord} from './types';
import {syncNordFloraWidget} from './lib/nativeWidget';

function getInitialView(): AppView {
  if (typeof window === 'undefined') return 'widget';
  const param = new URLSearchParams(window.location.search).get('view');
  if (param === 'collection' || param === 'climate' || param === 'lux' || param === 'widget') {
    return param;
  }
  return 'widget';
}

const MainApp: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const [view, setView] = useState<AppView>(getInitialView);
  const [collectionFilter, setCollectionFilter] = useState<'all' | 'due'>('all');
  const [plants, setPlants] = useState<PlantRecord[]>([]);
  const [monthlyTemps, setMonthlyTemps] = useState<MonthlyTemp[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editingPlant, setEditingPlant] = useState<PlantRecord | null>(null);
  const [detailPlantId, setDetailPlantId] = useState<string | null>(null);
  const [luxTargetPlantId, setLuxTargetPlantId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authReady || !user) {
      setPlants([]);
      setMonthlyTemps([]);
      return;
    }
    const unsubPlants = subscribePlants(user.uid, setPlants);
    const unsubTemps = subscribeMonthlyTemps(user.uid, setMonthlyTemps);
    return () => {
      unsubPlants();
      unsubTemps();
    };
  }, [authReady, user]);

  useEffect(() => {
    if (!user || plants.length === 0 || typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;

    const now = new Date();
    const monthKey = getCurrentMonthKey(now);
    const sessionKey = `nordflora_lux_notified_${monthKey}`;
    try {
      if (window.sessionStorage.getItem(sessionKey)) return;
    } catch {
      // ignore storage errors
    }

    const duePlants = plants.filter(
      (p) => getPlantAverageLuxStats(p, undefined, now).dueForMonthlyLux,
    );
    if (duePlants.length === 0) return;

    const peak = getBarcelonaPeakWindow(now);
    try {
      window.sessionStorage.setItem(sessionKey, '1');
    } catch {
      // ignore
    }

    new Notification(`NordFlora ${peak.monthName} Lux Check`, {
      body: `${duePlants.length} ${
        duePlants.length === 1 ? 'plant needs' : 'plants need'
      } a lux reading around Barcelona solar noon (${peak.timeRangeLabel}).`,
      icon: '/pwa-192x192.png',
    });
  }, [user, plants]);

  const navigateTo = (nextView: AppView) => {
    setView(nextView);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('view', nextView);
      window.history.replaceState({}, '', url.toString());
      window.scrollTo({top: 0, behavior: 'smooth'});
    }
  };

  const handleSignIn = async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      if (Capacitor.isNativePlatform()) {
        // Use the native Android Google account picker, then exchange its token
        // for a Firebase JS SDK session so Firestore continues using auth.currentUser.
        let result;
        try {
          result = await FirebaseAuthentication.signInWithGoogle({
            skipNativeAuth: true,
          });
        } catch (cmErr) {
          const cmMsg = cmErr instanceof Error ? cmErr.message : String(cmErr);
          if (
            /reauth/i.test(cmMsg) ||
            /\[16\]/.test(cmMsg) ||
            /credential/i.test(cmMsg) ||
            /NoCredential/i.test(cmMsg)
          ) {
            // Clear stale Credential Manager state and fall back to classic Google Sign-In picker
            await FirebaseAuthentication.signOut().catch(() => {});
            result = await FirebaseAuthentication.signInWithGoogle({
              skipNativeAuth: true,
              useCredentialManager: false,
            });
          } else {
            throw cmErr;
          }
        }
        const idToken = result.credential?.idToken;
        const accessToken = result.credential?.accessToken;
        if (!idToken) {
          throw new Error('Google sign-in did not return an ID token. Check the Android Firebase app and SHA-1 setup.');
        }
        const credential = GoogleAuthProvider.credential(idToken, accessToken);
        await signInWithCredential(auth, credential);
      } else {
        await signInWithPopup(auth, googleProvider);
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Google sign-in was cancelled.';
      if (
        /not implemented/i.test(raw) ||
        /FirebaseApp/i.test(raw) ||
        /default_web_client_id/i.test(raw)
      ) {
        setAuthError(
          'Google Sign-In in this APK needs google-services.json from Firebase Console (package com.nordflora.app + debug SHA-1) added to your GOOGLE_SERVICES_JSON GitHub secret before building.',
        );
      } else if (/reauth/i.test(raw) || /\[16\]/.test(raw) || /\b10:/.test(raw) || /12500/.test(raw)) {
        setAuthError(
          `${raw} — Make sure the latest SHA-1 from GitHub Actions "Build debug APK" is added to com.nordflora.app in Firebase Console (omega-fusion-ngt36), and re-download google-services.json into GOOGLE_SERVICES_JSON if you changed the Android app.`,
        );
      } else {
        setAuthError(raw);
      }
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    if (Capacitor.isNativePlatform()) {
      await FirebaseAuthentication.signOut().catch(() => {});
    }
    await signOut(auth);
  };

  useEffect(() => {
    if (!authReady) return;
    void syncNordFloraWidget(plants, monthlyTemps);
  }, [authReady, plants, monthlyTemps]);

  const handleSavePlant = async (input: SavePlantInput) => {
    if (!user) return;
    if (editingPlant) {
      await updatePlantDetails(user.uid, editingPlant.id, input);
    } else {
      await createPlant(user.uid, input);
    }
  };

  const handleWaterPlant = async (plant: PlantRecord) => {
    if (!user) return;
    await markPlantWatered(
      user.uid,
      plant,
      plant.entryType === 'group' ? `Watered group of ${plant.quantity}` : 'Watered',
    );
  };

  const handleUpdatePhoto = async (
    plantId: string,
    dataUrl: string,
    lookup?: PlantLookupResult | null,
  ) => {
    if (!user) return;
    await updatePlantPhotoAndCare(user.uid, plantId, dataUrl, lookup);
  };

  const handleDeletePlant = async (plant: PlantRecord) => {
    if (!user) return;
    await deletePlant(user.uid, plant.id);
    if (detailPlantId === plant.id) setDetailPlantId(null);
  };

  const handleSaveLux = async (
    plantId: string,
    luxValue: number,
    source: LuxSource,
    readingPeriod: 'peak_noon' | 'general',
    note?: string,
  ) => {
    if (!user) return;
    const targetPlant = plants.find((p) => p.id === plantId);
    if (!targetPlant) return;
    await recordPlantLux(user.uid, targetPlant, luxValue, source, readingPeriod, note);
  };

  const handleSaveMonthlyTemp = async (
    input: SaveMonthlyTempInput,
    existsAlready: boolean,
  ) => {
    if (!user) return;
    await saveMonthlyTemp(user.uid, input, existsAlready);
  };

  const detailPlant = plants.find((p) => p.id === detailPlantId) ?? null;

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#F7F7F4] flex items-center justify-center p-6">
        <p className="text-sm text-[#4B5850]">Loading NordFlora...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F7F7F4] flex flex-col">
        <header className="border-b border-[#E4E6DF] bg-white/90 backdrop-blur-md">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
            <span className="text-lg font-bold tracking-tight text-[#18221D] whitespace-nowrap shrink-0">
              NordFlora
            </span>
            <div className="flex items-center gap-3 shrink-0">
              <PWAInstallButton compact />
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 flex items-center">
          <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
              <div className="space-y-3">
                <p className="text-xs font-medium text-[#1F513B]">
                  Barcelona North-Facing Window Care · 41.39°N
                </p>
                <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[#18221D] text-balance leading-tight">
                  One tap to see which plants need water today.
                </h1>
                <p className="text-base text-[#4B5850] leading-relaxed max-w-xl">
                  Pin the Today&apos;s Watering Widget to your Android phone. Photograph every plant
                  or same-species group, record lux light levels, and log your monthly room
                  temperature and humidity.
                </p>
              </div>

              {authError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800">
                  {authError}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={signingIn}
                  onClick={() => void handleSignIn()}
                  className="min-h-[48px] px-6 py-3 rounded-xl bg-[#1F513B] text-white text-sm font-semibold hover:bg-[#173E2D] active:scale-[0.98] transition-all whitespace-nowrap"
                >
                  {signingIn ? 'Signing in...' : 'Continue with Google'}
                </button>
                <PWAInstallButton />
              </div>

              <div className="pt-2 border-t border-[#E4E6DF] grid grid-cols-3 gap-4 text-xs text-[#4B5850]">
                <div>
                  <span className="font-semibold text-[#18221D] block">Glance Widget</span>
                  <span>Shows today&apos;s plants to water</span>
                </div>
                <div>
                  <span className="font-semibold text-[#18221D] block">Lux + Camera</span>
                  <span>Photos &amp; light per plant</span>
                </div>
                <div>
                  <span className="font-semibold text-[#18221D] block">Room Climate</span>
                  <span>Monthly °C &amp; % humidity</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full min-h-[280px] rounded-3xl overflow-hidden border border-[#E4E6DF] bg-[#EAECE5]">
                <img
                  src="/src/assets/images/barcelona_north_window_1795203694182.jpg"
                  alt="Houseplants thriving on a north-facing Barcelona windowsill"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </main>
        <OfflineIndicator />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F7F4] flex flex-col pb-20 md:pb-8">
      {/* Desktop & Mobile Top Navigation Bar (Strict 3-Zone Contract) */}
      <header className="sticky top-0 z-30 h-14 bg-white/90 backdrop-blur-md border-b border-[#E4E6DF]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-full flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => navigateTo('widget')}
            className="text-lg font-bold tracking-tight text-[#18221D] whitespace-nowrap shrink-0 text-left"
          >
            NordFlora
          </button>

          {/* Zone 2: Concise single-line desktop nav links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {(
              [
                {id: 'widget', label: "Today's Widget"},
                {id: 'collection', label: 'All Plants'},
                {id: 'climate', label: 'Temp & Humidity'},
                {id: 'lux', label: 'Lux Meter'},
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateTo(item.id)}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                  view === item.id
                    ? 'border-[#1F513B] text-[#18221D]'
                    : 'border-transparent text-[#4B5850] hover:text-[#18221D]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: Single Primary Action + Sign Out icon */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setEditingPlant(null);
                setFormOpen(true);
              }}
              className="min-h-[40px] px-4 py-1.5 rounded-xl bg-[#1F513B] text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-[#173E2D] whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Add Plant</span>
            </button>

            <button
              type="button"
              onClick={() => void handleSignOut()}
              title={`Sign out (${user.email ?? 'account'})`}
              aria-label="Sign out"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#4B5850] hover:bg-[#F0F1EC] hover:text-[#18221D]"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {view === 'widget' && (
          <WidgetHomeView
            plants={plants}
            monthlyTemps={monthlyTemps}
            onOpenFullSchedule={(filter = 'all') => {
              setCollectionFilter(filter);
              navigateTo('collection');
            }}
            onSelectPlant={(plant) => setDetailPlantId(plant.id)}
            onWaterPlant={handleWaterPlant}
            onAddPlant={() => {
              setEditingPlant(null);
              setFormOpen(true);
            }}
            onOpenClimate={() => navigateTo('climate')}
            onOpenLux={(targetPlantId) => {
              if (targetPlantId) setLuxTargetPlantId(targetPlantId);
              navigateTo('lux');
            }}
          />
        )}

        {view === 'collection' && (
          <CollectionPage
            plants={plants}
            monthlyTemps={monthlyTemps}
            initialFilter={collectionFilter}
            onBackToWidget={() => navigateTo('widget')}
            onSelectPlant={(plant) => setDetailPlantId(plant.id)}
            onWaterPlant={handleWaterPlant}
            onAddPlant={() => {
              setEditingPlant(null);
              setFormOpen(true);
            }}
            onOpenLuxForPlant={(plant) => {
              setLuxTargetPlantId(plant.id);
              navigateTo('lux');
            }}
          />
        )}

        {view === 'climate' && (
          <ClimateView
            monthlyTemps={monthlyTemps}
            onSaveMonthlyTemp={handleSaveMonthlyTemp}
          />
        )}

        {view === 'lux' && (
          <LuxMeterView
            plants={plants}
            initialPlantId={luxTargetPlantId}
            onSaveLux={handleSaveLux}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar (Natural Thumb Zone, <= 15% sticky height cap) */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#E4E6DF] pb-safe"
      >
        <div className="grid grid-cols-4 h-14 items-center">
          {(
            [
              {id: 'widget', label: 'Widget', Icon: Smartphone},
              {id: 'collection', label: 'Plants', Icon: LayoutGrid},
              {id: 'climate', label: 'Climate', Icon: Thermometer},
              {id: 'lux', label: 'Lux', Icon: Sun},
            ] as const
          ).map(({id, label, Icon}) => {
            const active = view === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => navigateTo(id)}
                className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  active ? 'text-[#1F513B] font-semibold' : 'text-[#4B5850]'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[11px] leading-none">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Modals */}
      <PlantFormModal
        key={editingPlant ? `edit-${editingPlant.id}` : `new-${formOpen}`}
        isOpen={formOpen}
        initialPlant={editingPlant}
        onClose={() => {
          setFormOpen(false);
          setEditingPlant(null);
        }}
        onSave={handleSavePlant}
      />

      <PlantDetailModal
        userId={user.uid}
        plant={detailPlant}
        monthlyTemps={monthlyTemps}
        onClose={() => setDetailPlantId(null)}
        onWater={handleWaterPlant}
        onUpdatePhoto={handleUpdatePhoto}
        onEdit={(plant) => {
          setEditingPlant(plant);
          setFormOpen(true);
        }}
        onOpenLuxForPlant={(plant) => {
          setLuxTargetPlantId(plant.id);
          navigateTo('lux');
        }}
        onDelete={handleDeletePlant}
      />

      <OfflineIndicator />
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}
