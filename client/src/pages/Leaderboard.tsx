import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, type LeaderboardEntry } from '../api';

export const Leaderboard: React.FC = () => {
  const { user } = useAuth();
  const [donors, setDonors] = useState<LeaderboardEntry[]>([]);
  const [currentUserRank, setCurrentUserRank] = useState<LeaderboardEntry | null>(null);
  const [totalDonors, setTotalDonors] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.getLeaderboard()
      .then((data) => {
        setDonors(data.leaderboard || []);
        setTotalDonors(data.totalDonors || data.leaderboard?.length || 0);
        setCurrentUserRank(data.currentUserRank || null);
        setError(null);
      })
      .catch((err) => {
        console.error('Failed to load leaderboard:', err);
        setError('Unable to load leaderboard. Please try again.');
      })
      .finally(() => setLoading(false));
  }, []);

  const getInitials = (n: string) => {
    return n ? n.split(' ').map((x) => x[0]).join('').substring(0, 2).toUpperCase() : 'LD';
  };

  const first = donors[0];
  const second = donors[1];
  const third = donors[2];

  return (
    <div className="page active" id="leaderboard">
      <div className="section-sm" style={{ maxWidth: '750px', margin: '0 auto' }}>
        <div className="dash-title" style={{ marginBottom: '.4rem' }}>🏆 Donor Leaderboard</div>
        <div className="dash-sub" style={{ marginBottom: '1.25rem' }}>
          Celebrating verified donors ranked by life-saving contributions, response activity & XP
        </div>

        {/* Privacy Assurance Notice */}
        <div
          style={{
            background: 'rgba(30, 41, 59, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '8px',
            padding: '10px 14px',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '12px',
            color: '#94a3b8'
          }}
        >
          <span style={{ fontSize: '18px' }}>🔒</span>
          <div>
            <strong style={{ color: '#e2e8f0' }}>Privacy Protected:</strong> Donor contact information, exact addresses, and full names are masked on public community boards. Only verified completed donations count.
          </div>
        </div>

        {/* Current User Standing Card (if logged in as Donor) */}
        {user && user.role === 'Donor' && currentUserRank && (
          <div
            className="card"
            style={{
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(30, 41, 59, 0.8))',
              border: '1px solid var(--red)',
              padding: '14px 18px',
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  background: 'var(--red)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 900,
                  fontSize: '15px'
                }}
              >
                #{currentUserRank.rank}
              </div>
              <div>
                <div style={{ fontWeight: 800, color: '#f8fafc', fontSize: '14px' }}>
                  Your Community Standing
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                  Level {currentUserRank.level} · {currentUserRank.donations} Verified Donations · {currentUserRank.badgeCount} Badges
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#fbbf24', fontWeight: 900, fontSize: '16px' }}>
                {currentUserRank.xp.toLocaleString()} XP
              </div>
              <div style={{ fontSize: '11px', color: '#6ee7b7', fontWeight: 600 }}>
                Top {Math.max(1, Math.round((currentUserRank.rank / (totalDonors || 1)) * 100))}% of Donors
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="card" style={{ textAlign: 'center', color: '#f87171', padding: '1.5rem', marginBottom: '1.5rem' }}>
            {error}
          </div>
        )}

        {/* Dynamic Podium (Top 3) */}
        {!loading && donors.length >= 3 && (
          <div id="leaderboard-podium" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr', gap: '12px', marginBottom: '1.75rem', alignItems: 'flex-end' }}>
            {/* Second Place */}
            {second && (
              <div
                className="card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '1.25rem 0.75rem',
                  borderTop: '4px solid #94a3b8',
                  height: '165px',
                  textAlign: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)',
                  ...(second.isCurrent ? { border: '1px solid var(--red)', borderTop: '4px solid #94a3b8', background: 'var(--pk)' } : {})
                }}
              >
                <div style={{ position: 'absolute', top: '-15px', background: '#94a3b8', color: '#fff', borderRadius: '50%', width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '12px', border: '2px solid #fff' }}>
                  2
                </div>
                <div className="lb-av" style={{ background: 'linear-gradient(135deg, #cbd5e1, #94a3b8)', marginBottom: '8px' }}>
                  {getInitials(second.name)}
                </div>
                <div style={{ fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                  {second.name} {second.isCurrent && <span className="badge b-ok" style={{ fontSize: '8px', padding: '1px 4px' }}>You</span>}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--red)', fontWeight: 800, marginTop: '2px' }}>
                  {second.donations} Donations
                </div>
                <div style={{ fontSize: '10px', color: 'var(--gr)', fontWeight: 600 }}>
                  {second.xp.toLocaleString()} XP
                </div>
                <span className="badge b-gray" style={{ fontSize: '9px', marginTop: '4px' }}>
                  {second.bloodType}
                </span>
              </div>
            )}

            {/* First Place */}
            {first && (
              <div
                className="card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '1.25rem 0.75rem',
                  borderTop: '5px solid #fbbf24',
                  height: '195px',
                  textAlign: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
                  transform: 'translateY(-10px)',
                  ...(first.isCurrent ? { border: '1px solid var(--red)', borderTop: '5px solid #fbbf24', background: 'var(--pk)' } : {})
                }}
              >
                <div style={{ position: 'absolute', top: '-24px', fontSize: '26px' }}>👑</div>
                <div style={{ position: 'absolute', top: '-15px', background: '#fbbf24', color: '#fff', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '13px', border: '2px solid #fff' }}>
                  1
                </div>
                <div className="lb-av" style={{ background: 'linear-gradient(135deg, #fef08a, #fbbf24)', marginBottom: '8px', width: '48px', height: '48px', fontSize: '15px', border: '2px solid #fde047' }}>
                  {getInitials(first.name)}
                </div>
                <div style={{ fontWeight: 800, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                  {first.name} {first.isCurrent && <span className="badge b-ok" style={{ fontSize: '8px', padding: '1px 4px' }}>You</span>}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--red)', fontWeight: 900, marginTop: '2px' }}>
                  {first.donations} Donations
                </div>
                <div style={{ fontSize: '11px', color: 'var(--gr)', fontWeight: 700 }}>
                  {first.xp.toLocaleString()} XP
                </div>
                <span className="badge b-gray" style={{ fontSize: '9px', marginTop: '4px' }}>
                  {first.bloodType}
                </span>
              </div>
            )}

            {/* Third Place */}
            {third && (
              <div
                className="card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '1.25rem 0.75rem',
                  borderTop: '4px solid #b45309',
                  height: '155px',
                  textAlign: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)',
                  ...(third.isCurrent ? { border: '1px solid var(--red)', borderTop: '4px solid #b45309', background: 'var(--pk)' } : {})
                }}
              >
                <div style={{ position: 'absolute', top: '-15px', background: '#b45309', color: '#fff', borderRadius: '50%', width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '12px', border: '2px solid #fff' }}>
                  3
                </div>
                <div className="lb-av" style={{ background: 'linear-gradient(135deg, #d97706, #b45309)', marginBottom: '8px' }}>
                  {getInitials(third.name)}
                </div>
                <div style={{ fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                  {third.name} {third.isCurrent && <span className="badge b-ok" style={{ fontSize: '8px', padding: '1px 4px' }}>You</span>}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--red)', fontWeight: 800, marginTop: '2px' }}>
                  {third.donations} Donations
                </div>
                <div style={{ fontSize: '10px', color: 'var(--gr)', fontWeight: 600 }}>
                  {third.xp.toLocaleString()} XP
                </div>
                <span className="badge b-gray" style={{ fontSize: '9px', marginTop: '4px' }}>
                  {third.bloodType}
                </span>
              </div>
            )}
          </div>
        )}

        {/* List of all rankings */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>All Rankings</span>
            <span style={{ fontSize: '12px', color: 'var(--gr)', fontWeight: 500 }}>
              {totalDonors} registered donors
            </span>
          </div>
          <div id="leaderboard-tbody" style={{ display: 'flex', flexDirection: 'column' }}>
            {loading ? (
              <div style={{ textAlign: 'center', color: 'var(--gr)', padding: '2rem' }}>
                Loading community leaderboard…
              </div>
            ) : donors.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--gr)', padding: '2rem' }}>
                No active donors on the leaderboard yet.
              </div>
            ) : (
              donors.map((donor) => {
                const rank = donor.rank;
                const progressPct = Math.min(100, Math.round((donor.xp / 4000) * 100));
                const initials = getInitials(donor.name);
                const isCurrentUser = donor.isCurrent || (user && donor.id === user.id);

                return (
                  <div
                    key={donor.id}
                    className="lb-row"
                    style={isCurrentUser ? {
                      background: 'var(--pk)',
                      borderRadius: '8px',
                      padding: '10px',
                      margin: '4px -10px',
                      border: '1px dashed var(--red)'
                    } : {}}
                  >
                    <div className={`lb-rank ${rank === 1 ? 'r1' : rank === 2 ? 'r2' : rank === 3 ? 'r3' : ''}`}>
                      {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}
                    </div>
                    <div className="lb-av" style={{ background: 'linear-gradient(135deg, var(--rl), var(--rd))' }}>
                      {initials}
                    </div>
                    <div className="lb-info">
                      <div className="lb-name" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{donor.name}</span>
                        <span className="badge b-gray" style={{ fontSize: '9px', padding: '1px 5px' }}>{donor.bloodType}</span>
                        {isCurrentUser && <span className="badge b-ok" style={{ fontSize: '9px', padding: '2px 6px' }}>You</span>}
                      </div>
                      <div className="lb-sub">
                        Level {donor.level} · {donor.donations} donations · {donor.badgeCount} badges · {donor.location}
                      </div>
                      <div className="xp-bar">
                        <div className="xp-fill" style={{ width: `${progressPct}%` }} />
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: '70px' }}>
                      <strong style={{ color: 'var(--red)', fontSize: '14px' }}>{donor.xp.toLocaleString()}</strong>
                      <div style={{ fontSize: '9px', color: 'var(--gr)', fontWeight: 700 }}>XP</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
export default Leaderboard;