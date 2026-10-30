import React, { useState, useMemo } from 'react';
import { useTickets } from '../../context/TicketContext';
import { useAuth } from '../../context/AuthContext';
import WorkspaceSidebar from '../common/WorkspaceSidebar';
import DashboardHeroBanner from '../common/DashboardHeroBanner';
import NeetCodeTicketTable from '../tickets/NeetCodeTicketTable';
import confetti from 'canvas-confetti';

// Flexible Trade Normalizer
const normalizeTrade = (str = '') => {
  const s = String(str || '').toLowerCase().trim();
  if (s.includes('elec')) return 'electrical';
  if (s.includes('plumb') || s.includes('water') || s.includes('pipe')) return 'plumbing';
  if (s.includes('hvac') || s.includes('ac') || s.includes('cool') || s.includes('heat')) return 'hvac';
  if (s.includes('it') || s.includes('net') || s.includes('wifi')) return 'it';
  if (s.includes('gen')) return 'general';
  return s;
};

// Check if ticket mentions any electrical term
const isElectricalMatch = (ticket) => {
  const terms = ['elec', 'light', 'wire', 'spark', 'power', 'breaker', 'fan', 'switch', 'socket', 'ward'];
  const text = `${ticket.category || ''} ${ticket.assignedTo || ''} ${ticket.assignedSpecialty || ''} ${ticket.title || ''} ${ticket.description || ''} ${ticket.complaint || ''}`.toLowerCase();
  return terms.some((term) => text.includes(term));
};

// Strict dual-approval resolved check: ticket is open until BOTH tech and user have confirmed
const isTicketCompleted = (t) => {
  return Boolean(t.techConfirmed && t.userConfirmed) || t.status === 'Completed';
};

export default function TechnicianDashboard({ onSelectTicket }) {
  const { tickets, handleTicketClosure, confirmTicketCompletion, addToast } = useTickets();
  const { currentUser } = useAuth();

  const [activeSegment, setActiveSegment] = useState('all'); // 'all' | 'active' | 'resolved'
  
  // Default to technician's normalized trade on initial load, while allowing 'All' preview
  const [selectedCategory, setSelectedCategory] = useState(() => {
    const raw = currentUser?.specialty || '';
    const norm = normalizeTrade(raw);
    if (norm === 'electrical') return 'Electrical';
    if (norm === 'plumbing') return 'Plumbing';
    if (norm === 'hvac') return 'HVAC';
    if (norm === 'it') return 'IT';
    if (norm === 'general') return 'General';
    return 'All';
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFeatureFilter, setActiveFeatureFilter] = useState('all');

  // Flexible Trade Matching & RAG Priority Sorting
  const myDepartmentTickets = useMemo(() => {
    const deptFiltered = tickets.filter((ticket) => {
      // Allow clicking 'All Categories' or 'All' in left sidebar to preview all tickets
      if (selectedCategory === 'All' || selectedCategory === 'all-tickets') return true;

      const targetSpec = selectedCategory || currentUser?.specialty || '';
      const normTarget = normalizeTrade(targetSpec);

      // When filtering for 'Electrical', match any electrical term across all fields
      if (normTarget === 'electrical') {
        if (isElectricalMatch(ticket)) return true;
      }

      return (
        normalizeTrade(ticket.category) === normTarget ||
        normalizeTrade(ticket.assignedSpecialty) === normTarget ||
        normalizeTrade(ticket.assignedTo) === normTarget
      );
    });

    return [...deptFiltered].sort((a, b) => {
      const scoreA = Number(a.priorityScore !== undefined ? a.priorityScore : 40);
      const scoreB = Number(b.priorityScore !== undefined ? b.priorityScore : 40);
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      const volA = Number(a.ragTicketVolume || 1);
      const volB = Number(b.ragTicketVolume || 1);
      return volB - volA;
    });
  }, [tickets, currentUser, selectedCategory]);

  // Department-specific KPI stats
  const deptStats = useMemo(() => {
    let open = 0;
    let done = 0;
    let urgent = 0;

    myDepartmentTickets.forEach((t) => {
      const isResolved = isTicketCompleted(t);
      if (isResolved) {
        done++;
      } else {
        open++;
      }

      const p = (t.priority || t.urgency || '').toLowerCase();
      if (p === 'urgent' || p === 'emergency' || p === 'critical' || p === 'moderate') {
        urgent++;
      }
    });

    return {
      resolvedCount: done,
      openCount: open,
      escalatedCount: urgent,
      total: myDepartmentTickets.length,
      activeCount: open
    };
  }, [myDepartmentTickets]);

  // Filter tickets by search and feature filters within the department queue
  const displayedTickets = useMemo(() => {
    return myDepartmentTickets.filter((ticket) => {
      const isResolved = isTicketCompleted(ticket);
      if (activeSegment === 'active' && isResolved) return false;
      if (activeSegment === 'resolved' && !isResolved) return false;

      // Feature filter
      if (activeFeatureFilter === 'urgent') {
        const p = (ticket.priority || ticket.urgency || '').toLowerCase();
        if (p !== 'urgent' && p !== 'emergency' && p !== 'critical') return false;
      } else if (activeFeatureFilter === 'rag-history') {
        if (!ticket.ragTicketVolume || Number(ticket.ragTicketVolume) < 2) return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const cleanQ = q.startsWith('#') ? q.slice(1).trim() : q;
        const idStr = String(ticket?.id || '').toLowerCase();
        const titleStr = String(ticket?.title || ticket?.complaint || '').toLowerCase();
        const locStr = String(ticket?.location || '').toLowerCase();
        const catStr = String(ticket?.category || '').toLowerCase();

        const matches =
          idStr.includes(cleanQ) ||
          titleStr.includes(q) ||
          locStr.includes(q) ||
          catStr.includes(q);

        if (!matches) return false;
      }

      return true;
    });
  }, [myDepartmentTickets, activeSegment, activeFeatureFilter, searchQuery]);

  // Handle Technician completion toggle / Mark Fixed
  const handleToggleComplete = async (ticket) => {
    if (ticket.status === 'Completed' || ticket.status === 'Done') {
      addToast({
        type: 'info',
        title: 'Already Completed',
        message: 'This ticket has already been resolved and archived.'
      });
      return;
    }

    if (ticket.techConfirmed) {
      addToast({
        type: 'info',
        title: 'Verification In Flight',
        message: 'Technician sign-off already logged. Awaiting campus user confirmation.'
      });
      return;
    }

    try {
      const fn = confirmTicketCompletion || handleTicketClosure;
      await fn(ticket.id, 'technician');
    } catch (e) {
      addToast({
        type: 'error',
        title: 'Signoff Error',
        message: e?.message || 'Failed to update ticket status.'
      });
    }
  };

  return (
    <div className="w-full max-w-[1440px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* 1. Left Sidebar (lg:col-span-3 xl:col-span-2) */}
      <div className="lg:col-span-3 xl:col-span-2">
        <WorkspaceSidebar
          currentView={activeFeatureFilter === 'rag-history' ? 'rag-history' : 'all-tickets'}
          onSelectView={(view) => {
            if (view === 'rag-history') {
              setActiveFeatureFilter('rag-history');
            } else {
              setActiveFeatureFilter('all');
            }
          }}
          selectedCategory={selectedCategory}
          onSelectCategory={(cat) => setSelectedCategory(cat)}
          role="technician"
          stats={deptStats}
        />
      </div>

      {/* 2. Center Main Content (lg:col-span-9 xl:col-span-10) */}
      <main className="lg:col-span-9 xl:col-span-10 min-w-0 space-y-6">
        {/* Top Category Feature Cards, Hero Banner Card, Search Toolbar */}
        <DashboardHeroBanner
          title="Technician Queue"
          subtitle={`Priority routing strictly assigned to ${currentUser?.specialty || 'General'} Trade.`}
          stats={deptStats}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeFeatureFilter={activeFeatureFilter}
          onFeatureCardClick={(filter) => {
            setActiveFeatureFilter((prev) => (prev === filter ? 'all' : filter));
          }}
        />

        {/* NeetCode-Style Ticket Table / Row List */}
        <NeetCodeTicketTable
          tickets={displayedTickets}
          onSelectTicket={onSelectTicket}
          onToggleComplete={handleToggleComplete}
          role="technician"
          emptyMessage={
            activeFeatureFilter === 'rag-history'
              ? 'No recurrent tickets detected in your department queue.'
              : `Your ${currentUser?.specialty || 'Department'} queue is completely clear!`
          }
        />
      </main>
    </div>
  );
}
