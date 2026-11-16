import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useRouting } from '../context/RoutingContext';
import { api, type Donation, type DonationCertificate } from '../api';
import QRCode from 'qrcode';

interface BadgeDefinition {
  id: string;
  title: string;
  icon: string;
  description: string;
  isUnlocked: (stats: { completed: number; units: number; hasEmergency: boolean; hasCamp: boolean; bloodType: string }) => boolean;
  getProgress: (stats: { completed: number; units: number; hasEmergency: boolean; hasCamp: boolean; bloodType: string }) => string;
}

const BADGES: BadgeDefinition[] = [
  {
    id: 'first_drop',
    title: 'First Drop',
    icon: '🩸',
    description: 'Completed your first verified life-saving blood donation.',
    isUnlocked: (s) => s.completed >= 1,
    getProgress: (s) => (s.completed >= 1 ? 'Unlocked' : `${s.completed}/1 donation`)
  },
  {
    id: 'lifesaver',
    title: 'Bronze Lifesaver',
    icon: '🥉',
    description: 'Achieved 3 verified completed donations.',
    isUnlocked: (s) => s.completed >= 3,
    getProgress: (s) => (s.completed >= 3 ? 'Unlocked' : `${s.completed}/3 donations`)
  },
  {
    id: 'guardian',
    title: 'Silver Guardian',
    icon: '🥈',
    description: 'Achieved 5 verified completed donations.',
    isUnlocked: (s) => s.completed >= 5,
    getProgress: (s) => (s.completed >= 5 ? 'Unlocked' : `${s.completed}/5 donations`)
  },
  {
    id: 'champion',
    title: 'Gold Champion',
    icon: '🥇',
    description: 'Achieved 10 verified completed donations.',
    isUnlocked: (s) => s.completed >= 10,
    getProgress: (s) => (s.completed >= 10 ? 'Unlocked' : `${s.completed}/10 donations`)
  },
  {
    id: 'legend',
    title: 'Century Legend',
    icon: '💎',
    description: 'Hero of the community with 25+ verified donations.',
    isUnlocked: (s) => s.completed >= 25,
    getProgress: (s) => (s.completed >= 25 ? 'Unlocked' : `${s.completed}/25 donations`)
  },
  {
    id: 'emergency_hero',
    title: 'Rapid Responder',
    icon: '🚨',
    description: 'Responded to an urgent emergency dispatch alert and donated.',
    isUnlocked: (s) => s.hasEmergency,
    getProgress: (s) => (s.hasEmergency ? 'Unlocked' : 'Respond to 1 emergency')
  },
  {
    id: 'camp_hero',
    title: 'Camp Champion',
    icon: '⛺',
    description: 'Donated at an official community blood donation camp.',
    isUnlocked: (s) => s.hasCamp,
    getProgress: (s) => (s.hasCamp ? 'Unlocked' : 'Donate at 1 blood camp')
  },
  {
    id: 'rare_donor',
    title: 'Rare Blood Shield',
    icon: '🌟',
    description: 'Critical donor with a rare or negative Rh blood type.',
    isUnlocked: (s) => ['O-', 'A-', 'B-', 'AB-', 'AB+'].includes(s.bloodType),
    getProgress: (s) => (['O-', 'A-', 'B-', 'AB-', 'AB+'].includes(s.bloodType) ? 'Unlocked' : 'Special Rh Type')
  }
];

interface Milestone {
  tier: string;
  target: number;
  badge: string;
  rewardXp: number;
}

const MILESTONES: Milestone[] = [
  { tier: 'Rookie Lifesaver', target: 1, badge: '🩸', rewardXp: 200 },
  { tier: 'Community Guardian', target: 3, badge: '🥉', rewardXp: 600 },
  { tier: 'Silver Vanguard', target: 5, badge: '🥈', rewardXp: 1200 },
  { tier: 'Gold Champion', target: 10, badge: '🥇', rewardXp: 2500 },
  { tier: 'Century Legend', target: 25, badge: '💎', rewardXp: 6000 }
];

export const Passport: React.FC = () => {
  const { user, isLoggedIn, updateUserContext } = useAuth();
  const { showToast } = useToast();
  const { navigateTo } = useRouting();

  const [history, setHistory] = useState<Donation[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [qrSvg, setQrSvg] = useState<string>('');

  // Certificate Modal State
  const [selectedCertificate, setSelectedCertificate] = useState<DonationCertificate | null>(null);

  // Edit Profile Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editAvailability, setEditAvailability] = useState<'Active' | 'On Duty' | 'Inactive'>('Active');
  const [savingProfile, setSavingProfile] = useState(false);

  const isDonor = isLoggedIn && user && user.role === 'Donor';

  useEffect(() => {
    if (!isDonor || !user) return;
    setLoadingHistory(true);
    api
      .getDonations(user.id)
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setLoadingHistory(false));
  }, [isDonor, user?.id]);

  useEffect(() => {
    if (!isDonor || !user?.passportId) return;
    QRCode.toString(`LIFELINK-DONOR-PASSPORT:${user.passportId}`, {
      type: 'svg',
      margin: 0,
      width: 90,
      color: { dark: '#1a1a2e', light: '#ffffff' }
    })
      .then(setQrSvg)
      .catch(() => setQrSvg(''));
  }, [isDonor, user?.passportId]);

  const handleShare = () => {
    if (navigator?.clipboard?.writeText && user?.passportId) {
      navigator.clipboard.writeText(`https://lifelink.health/verify-passport/${user.passportId}`).catch(() => {});
    }
    showToast(
      'success',
      '🔗 Link Copied!',
      'Your donor passport verification link has been copied to clipboard.'
    );
  };

  const getInitials = (n: string) => {
    return n ? n.split(' ').map((x) => x[0]).join('').substring(0, 2).toUpperCase() : 'LD';
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Metrics derived strictly from verified completed donations
  const completedHistory = history.filter((h) => h.status === 'Completed');
  const totalCompletedDonations = Math.max(completedHistory.length, user?.donations || 0);
  const totalUnitsDonated = completedHistory.reduce((sum, h) => sum + (h.units || 1), 0) || totalCompletedDonations;
  const livesSaved = totalUnitsDonated * 3;

  // Recent completed donation & next eligibility calculation (90-day clinical whole blood interval)
  const lastCompletedDonation = completedHistory[0]; // sorted DESC from API
  const lastDonationDateStr = lastCompletedDonation?.donationDate || user?.lastDonationDate || null;

  const eligibilityCalculation = (() => {
    if (!lastDonationDateStr) {
      return { isEligibleNow: true, daysRemaining: 0, nextDateLabel: 'Eligible Now ✓' };
    }
    const lastDate = new Date(lastDonationDateStr);
    const eligibleDate = new Date(lastDate);
    eligibleDate.setDate(eligibleDate.getDate() + 90);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffMs = eligibleDate.getTime() - today.getTime();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (daysRemaining <= 0) {
      return { isEligibleNow: true, daysRemaining: 0, nextDateLabel: 'Eligible Now ✓' };
    }
    return {
      isEligibleNow: false,
      daysRemaining,
      nextDateLabel: `${daysRemaining} days (${formatDate(eligibleDate.toISOString())})`
    };
  })();

  const level = user ? Math.floor(user.xp / 300) || 1 : 1;

  // Stats for badge evaluations
  const badgeStats = {
    completed: totalCompletedDonations,
    units: totalUnitsDonated,
    hasEmergency: completedHistory.some((h) => h.channel === 'hospital' || (h.details && h.details.toLowerCase().includes('emergency'))),
    hasCamp: completedHistory.some((h) => h.channel === 'camp' || (h.details && h.details.toLowerCase().includes('camp'))),
    bloodType: user?.bloodType || 'O+'
  };

  // Next Milestone calculation
  const currentMilestoneIndex = MILESTONES.findIndex((m) => totalCompletedDonations < m.target);
  const nextMilestone = currentMilestoneIndex !== -1 ? MILESTONES[currentMilestoneIndex] : MILESTONES[MILESTONES.length - 1];
  const prevMilestoneTarget = currentMilestoneIndex > 0 ? MILESTONES[currentMilestoneIndex - 1].target : 0;
  const milestoneProgressPct = currentMilestoneIndex === -1
    ? 100
    : Math.min(100, Math.max(0, Math.round(((totalCompletedDonations - prevMilestoneTarget) / (nextMilestone.target - prevMilestoneTarget)) * 100)));

  // View Certificate Handler
  const handleViewCertificate = async (donationId: string) => {
    try {
      const cert = await api.getDonationCertificate(donationId);
      setSelectedCertificate(cert);
    } catch (err: any) {
      showToast('warning', 'Certificate Error', err.message || 'Unable to load certificate');
    }
  };

  // Open Edit Profile Modal
  const handleOpenEdit = () => {
    if (!user) return;
    setEditName(user.name || '');
    setEditPhone(user.phone || '');
    setEditLocation(user.location || '');
    setEditAvailability(user.availabilityStatus || 'Active');
    setShowEditModal(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    try {
      await updateUserContext({
        name: editName.trim(),
        phone: editPhone.trim(),
        location: editLocation.trim(),
        availabilityStatus: editAvailability
      });
      showToast('success', 'Profile Updated', 'Your donor profile details have been successfully saved.');
      setShowEditModal(false);
    } catch (err: any) {
      showToast('warning', 'Update Failed', err.message || 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="page active" id="passport">
      <div className="section-sm" style={{ maxWidth: '680px', margin: '0 auto' }}>
        <div className="dash-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <div className="dash-title">🪪 Digital Blood Passport</div>
            <div className="dash-sub">Official verified donor credentials, badges & life-saving records</div>
          </div>
          {isDonor && (
            <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#f1f5f9' }} onClick={handleOpenEdit}>
              ✏️ Edit Profile
            </button>
          )}
        </div>

        {!isDonor ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🪪</div>
            <h3>Donor Passport Unavailable</h3>
            <p style={{ color: 'var(--gr)', fontSize: '13px', marginTop: '8px', marginBottom: '1.5rem' }}>
              Donor Passports and gamification badges are exclusive to registered blood donors. Please sign in with a Donor account to view your passport.
            </p>
            {!isLoggedIn ? (
              <button className="btn btn-red" onClick={() => navigateTo('auth')}>
                Sign In / Register
              </button>
            ) : (
              <span className="badge b-gray" style={{ padding: '6px 12px' }}>Role: {user?.role}</span>
            )}
          </div>
        ) : (
          <>
            {/* Main Digital Passport Card */}
            <div className="passport">
              <div className="pp-bg">🩸</div>
              <div className="pp-hdr">
                <div className="pp-av">{getInitials(user.name)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div className="pp-name">{user.name}</div>
                    <span className={`badge ${user.availabilityStatus === 'Active' ? 'b-ok' : user.availabilityStatus === 'On Duty' ? 'b-blue' : 'b-gray'}`} style={{ fontSize: '10px' }}>
                      ● {user.availabilityStatus || 'Active'}
                    </span>
                  </div>
                  <div className="pp-id">Passport ID: {user.passportId}</div>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                    <span style={{ background: 'rgba(231,76,60,.3)', color: '#fca5a5', fontSize: '10px', padding: '3px 10px', borderRadius: '12px', fontWeight: 700 }}>
                      ✅ Verified Donor
                    </span>
                    <span style={{ background: 'rgba(16,185,129,.2)', color: '#6ee7b7', fontSize: '10px', padding: '3px 10px', borderRadius: '12px', fontWeight: 700 }}>
                      Level {level} Lifesaver
                    </span>
                    <span style={{ background: 'rgba(245,158,11,.2)', color: '#fcd34d', fontSize: '10px', padding: '3px 10px', borderRadius: '12px', fontWeight: 700 }}>
                      🏆 {BADGES.filter((b) => b.isUnlocked(badgeStats)).length} Badges
                    </span>
                  </div>
                </div>
              </div>

              {/* Passport Grid Info */}
              <div className="pp-grid">
                <div className="pp-field">
                  <div className="pp-lbl">Blood Type</div>
                  <div className="pp-val big" style={{ color: 'var(--red)' }}>{user.bloodType}</div>
                </div>
                <div className="pp-field">
                  <div className="pp-lbl">Completed Donations</div>
                  <div className="pp-val big">{totalCompletedDonations}</div>
                </div>
                <div className="pp-field">
                  <div className="pp-lbl">Total Blood Units</div>
                  <div className="pp-val big" style={{ color: '#60a5fa' }}>{totalUnitsDonated} <span style={{ fontSize: '12px', fontWeight: 500 }}>units</span></div>
                </div>
                <div className="pp-field">
                  <div className="pp-lbl">Estimated Lives Saved</div>
                  <div className="pp-val big" style={{ color: '#34d399' }}>{livesSaved}</div>
                </div>
                <div className="pp-field">
                  <div className="pp-lbl">Last Donated</div>
                  <div className="pp-val" style={{ fontSize: '.85rem' }}>{formatDate(lastDonationDateStr)}</div>
                </div>
                <div className="pp-field">
                  <div className="pp-lbl">Next Eligible (Whole Blood)</div>
                  <div className="pp-val" style={{ fontSize: '.85rem', color: eligibilityCalculation.isEligibleNow ? '#6ee7b7' : '#f87171', fontWeight: 700 }}>
                    {eligibilityCalculation.nextDateLabel}
                  </div>
                </div>
                <div className="pp-field" style={{ gridColumn: 'span 2' }}>
                  <div className="pp-lbl">Total Earned XP</div>
                  <div className="pp-val" style={{ fontSize: '1rem', color: '#fbbf24', fontWeight: 800 }}>
                    {user.xp.toLocaleString()} XP
                  </div>
                </div>
              </div>

              {/* QR Verification Area */}
              <div className="qr-area">
                <div
                  className="qr-box"
                  id="qr-box"
                  style={{ width: '90px', height: '90px', background: '#fff', borderRadius: '4px', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  dangerouslySetInnerHTML={qrSvg ? { __html: qrSvg } : undefined}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#e2e8f0', marginBottom: '3px' }}>
                    Official Hospital QR Verification
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.5 }}>
                    Scan at any accredited LifeLink hospital or blood donation camp for instant medical verification.
                  </div>
                  <button
                    className="btn btn-sm"
                    style={{ background: 'rgba(255,255,255,.12)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,.15)', fontSize: '11px', padding: '5px 14px', marginTop: '8px' }}
                    onClick={handleShare}
                  >
                    📲 Share Verification Link
                  </button>
                </div>
              </div>
            </div>

            {/* Clinical Guidance Disclaimer */}
            <div
              style={{
                background: 'rgba(30, 41, 59, 0.7)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: '8px',
                padding: '12px 16px',
                marginTop: '1rem',
                fontSize: '11px',
                color: '#cbd5e1',
                lineHeight: 1.5
              }}
            >
              <div style={{ fontWeight: 700, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <span>⚠️ Clinical Notice & Eligibility Guidance</span>
              </div>
              The next eligible donation countdown is an informational guide based on standard clinical whole blood donation recovery intervals (minimum 90 days). It does not constitute formal medical clearance. Clinical eligibility is strictly determined on-site by healthcare professionals following hemoglobin testing and physical assessment.
            </div>

            {/* Donation Milestones Tracker */}
            <div className="card" style={{ marginTop: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div className="card-title" style={{ margin: 0 }}>🎯 Donation Milestones</div>
                <span className="badge b-ok" style={{ fontSize: '11px' }}>
                  Current Tier: {nextMilestone.tier}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--gr)', marginBottom: '12px' }}>
                {totalCompletedDonations >= 25
                  ? '👑 You have achieved the highest Century Legend tier! Thank you for being a continuous life-saver.'
                  : `Target: ${nextMilestone.target} donations for ${nextMilestone.badge} ${nextMilestone.tier} (+${nextMilestone.rewardXp} bonus XP)`}
              </div>
              <div className="xp-bar" style={{ height: '10px', background: 'rgba(255,255,255,0.08)', borderRadius: '5px', overflow: 'hidden' }}>
                <div
                  className="xp-fill"
                  style={{
                    width: `${milestoneProgressPct}%`,
                    background: 'linear-gradient(90deg, #ef4444, #f59e0b)',
                    height: '100%',
                    borderRadius: '5px',
                    transition: 'width 0.5s ease'
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>
                <span>{totalCompletedDonations} verified donations</span>
                <span>{milestoneProgressPct}% toward next tier</span>
              </div>
            </div>

            {/* Digital Badges Section */}
            <div className="card" style={{ marginTop: '1.25rem' }}>
              <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <span>🎖️ Digital Achievement Badges</span>
                <span style={{ fontSize: '12px', color: 'var(--gr)', fontWeight: 500 }}>
                  {BADGES.filter((b) => b.isUnlocked(badgeStats)).length} of {BADGES.length} Unlocked
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
                {BADGES.map((badge) => {
                  const unlocked = badge.isUnlocked(badgeStats);
                  const progress = badge.getProgress(badgeStats);

                  return (
                    <div
                      key={badge.id}
                      style={{
                        background: unlocked ? 'rgba(239, 68, 68, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                        border: unlocked ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(255, 255, 255, 0.06)',
                        borderRadius: '8px',
                        padding: '12px 10px',
                        textAlign: 'center',
                        position: 'relative',
                        transition: 'all 0.2s ease',
                        opacity: unlocked ? 1 : 0.6
                      }}
                    >
                      <div style={{ fontSize: '28px', marginBottom: '6px', filter: unlocked ? 'none' : 'grayscale(100%)' }}>
                        {badge.icon}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: '12px', color: unlocked ? '#f1f5f9' : '#94a3b8', marginBottom: '4px' }}>
                        {badge.title}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--gr)', lineHeight: 1.3, minHeight: '26px', marginBottom: '8px' }}>
                        {badge.description}
                      </div>
                      <span
                        className={`badge ${unlocked ? 'b-ok' : 'b-gray'}`}
                        style={{ fontSize: '9px', padding: '2px 6px', fontWeight: 700 }}
                      >
                        {progress}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Donation History Table */}
            <div className="card" style={{ marginTop: '1.25rem' }}>
              <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Donation History & Certificates</span>
                <span style={{ fontSize: '12px', color: 'var(--gr)' }}>
                  {totalCompletedDonations} verified records
                </span>
              </div>
              <table className="tbl" style={{ marginTop: '8px' }}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Date</th>
                    <th>Facility</th>
                    <th>Units</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Certificate</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingHistory ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: 'var(--gr)', padding: '1rem' }}>
                        Loading donation history…
                      </td>
                    </tr>
                  ) : history.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: 'var(--gr)', padding: '1.5rem' }}>
                        No donation history recorded yet. Join a donation camp or respond to an emergency to earn your first badge!
                      </td>
                    </tr>
                  ) : (
                    history.map((rec, i) => {
                      const isCompleted = rec.status === 'Completed';

                      return (
                        <tr key={rec.id}>
                          <td style={{ fontWeight: 700 }}>{history.length - i}</td>
                          <td>{formatDate(rec.donationDate)}</td>
                          <td>{rec.hospital}</td>
                          <td style={{ fontWeight: 700, color: 'var(--red)' }}>{rec.units || 1} u</td>
                          <td>
                            <span className={`badge ${isCompleted ? 'b-ok' : rec.status === 'In Progress' ? 'b-blue' : 'b-gray'}`}>
                              {rec.status}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {isCompleted ? (
                              <button
                                className="btn btn-sm"
                                style={{
                                  fontSize: '10px',
                                  padding: '3px 8px',
                                  background: 'rgba(16,185,129,0.15)',
                                  border: '1px solid rgba(16,185,129,0.3)',
                                  color: '#6ee7b7'
                                }}
                                onClick={() => handleViewCertificate(rec.id)}
                              >
                                📜 Certificate
                              </button>
                            ) : (
                              <span style={{ fontSize: '10px', color: 'var(--gr)' }}>Pending Draw</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Official Certificate Modal */}
            {selectedCertificate && (
              <div className="modal-backdrop" onClick={() => setSelectedCertificate(null)}>
                <div className="modal-box" style={{ maxWidth: '520px', padding: '0', overflow: 'hidden', background: '#0f172a', border: '2px solid #fbbf24', borderRadius: '12px' }} onClick={(e) => e.stopPropagation()}>
                  <div style={{ background: 'linear-gradient(135deg, #78350f, #1e293b)', padding: '20px', textAlign: 'center', borderBottom: '1px solid rgba(251, 191, 36, 0.4)' }}>
                    <div style={{ fontSize: '32px', marginBottom: '4px' }}>🏅</div>
                    <h2 style={{ color: '#fbbf24', margin: 0, fontSize: '18px', letterSpacing: '1px', textTransform: 'uppercase' }}>
                      Certificate of Voluntary Blood Donation
                    </h2>
                    <div style={{ fontSize: '11px', color: '#fef3c7', marginTop: '4px' }}>
                      LifeLink Healthcare Emergency Blood Network
                    </div>
                  </div>

                  <div style={{ padding: '24px 20px', textAlign: 'center' }}>
                    <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      This is proudly presented to
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: '#f8fafc', margin: '8px 0 4px 0' }}>
                      {selectedCertificate.donorName}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                      Donor ID: {selectedCertificate.maskedPassportId} · Blood Group: <strong style={{ color: 'var(--red)' }}>{selectedCertificate.bloodType}</strong>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.12)', borderRadius: '8px', padding: '14px', margin: '16px 0', textAlign: 'left', fontSize: '12px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>
                          <div style={{ color: '#64748b', fontSize: '10px' }}>Donation Date</div>
                          <div style={{ fontWeight: 700, color: '#f1f5f9' }}>{formatDate(selectedCertificate.donationDate)}</div>
                        </div>
                        <div>
                          <div style={{ color: '#64748b', fontSize: '10px' }}>Units Contributed</div>
                          <div style={{ fontWeight: 700, color: '#60a5fa' }}>{selectedCertificate.units} Unit(s)</div>
                        </div>
                        <div style={{ gridColumn: 'span 2' }}>
                          <div style={{ color: '#64748b', fontSize: '10px' }}>Certified Facility</div>
                          <div style={{ fontWeight: 700, color: '#f1f5f9' }}>{selectedCertificate.facility}</div>
                        </div>
                        <div>
                          <div style={{ color: '#64748b', fontSize: '10px' }}>Certificate ID</div>
                          <div style={{ fontWeight: 700, color: '#fbbf24', fontSize: '10px' }}>{selectedCertificate.certificateId}</div>
                        </div>
                        <div>
                          <div style={{ color: '#64748b', fontSize: '10px' }}>Verification Hash</div>
                          <div style={{ fontWeight: 700, color: '#34d399', fontSize: '10px' }}>{selectedCertificate.verificationCode}</div>
                        </div>
                      </div>
                    </div>

                    <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', marginBottom: '16px' }}>
                      "{selectedCertificate.disclaimer}"
                    </div>

                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                      <button className="btn btn-sm btn-red" onClick={() => window.print()}>
                        🖨️ Print / Save Certificate
                      </button>
                      <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }} onClick={() => setSelectedCertificate(null)}>
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Edit Profile Modal */}
            {showEditModal && (
              <div className="modal-backdrop" onClick={() => setShowEditModal(false)}>
                <div className="modal-box" style={{ maxWidth: '440px', padding: '24px' }} onClick={(e) => e.stopPropagation()}>
                  <div className="dash-title" style={{ fontSize: '18px', marginBottom: '6px' }}>✏️ Edit Donor Profile</div>
                  <div className="dash-sub" style={{ fontSize: '12px', marginBottom: '16px' }}>
                    Update your contact info and availability. Donation records and earned XP cannot be modified manually.
                  </div>

                  <form onSubmit={handleSaveProfile}>
                    <div className="field-group" style={{ marginBottom: '12px' }}>
                      <label className="lbl" style={{ fontSize: '12px' }}>Full Name</label>
                      <input
                        type="text"
                        className="inp"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        required
                        disabled={savingProfile}
                      />
                    </div>

                    <div className="field-group" style={{ marginBottom: '12px' }}>
                      <label className="lbl" style={{ fontSize: '12px' }}>Phone Number</label>
                      <input
                        type="text"
                        className="inp"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        placeholder="+91 98765 43210"
                        disabled={savingProfile}
                      />
                    </div>

                    <div className="field-group" style={{ marginBottom: '12px' }}>
                      <label className="lbl" style={{ fontSize: '12px' }}>City / Locality</label>
                      <input
                        type="text"
                        className="inp"
                        value={editLocation}
                        onChange={(e) => setEditLocation(e.target.value)}
                        placeholder="Chennai, Tamil Nadu"
                        disabled={savingProfile}
                      />
                    </div>

                    <div className="field-group" style={{ marginBottom: '18px' }}>
                      <label className="lbl" style={{ fontSize: '12px' }}>Emergency Availability Status</label>
                      <select
                        className="inp"
                        value={editAvailability}
                        onChange={(e) => setEditAvailability(e.target.value as any)}
                        disabled={savingProfile}
                      >
                        <option value="Active">Active (Available for emergency alerts)</option>
                        <option value="On Duty">On Duty (Available if urgent)</option>
                        <option value="Inactive">Inactive (Temporarily unavailable)</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                      <button type="button" className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.08)', color: '#94a3b8' }} onClick={() => setShowEditModal(false)} disabled={savingProfile}>
                        Cancel
                      </button>
                      <button type="submit" className="btn btn-sm btn-red" disabled={savingProfile}>
                        {savingProfile ? 'Saving…' : 'Save Changes'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
export default Passport;