import React, { useState, useMemo } from 'react';
import { useTickets } from '../../context/TicketContext';
import { useAuth } from '../../context/AuthContext';
import WorkspaceSidebar from '../common/WorkspaceSidebar';
import DashboardHeroBanner from '../common/DashboardHeroBanner';
import NeetCodeTicketTable from '../tickets/NeetCodeTicketTable';
import SlaPriorityRingWidget from '../common/SlaPriorityRingWidget';
import ActivityCalendarWidget from '../common/ActivityCalendarWidget';
import confetti from 'canvas-confetti';

export default function TechnicianDashboard({ onSelectTicket }) {
  const { tickets, handleTicketClosure, addToast } = useTickets();
  const { currentUser } = useAuth();

  const [activeSegment, setActiveSegment] = useState('all'); // 'all' | 'active' | 'resolved'
  const [selectedCategory, setSelectedCategory] = useState(currentUser?.specialty || 'All');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFeatureFilter, setActiveFeatureFilter] = useState('all');

  // Strict Single-Specialty Department Queue Filtering & RAG Priority Sorting
  const myDepartmentTickets = useMemo(() => {
    const deptFiltered = tickets.filter((ticket) => {
      if (!currentUser?.specialty) return true;
      const spec = currentUser.specialty.toLowerCase().trim();
      const cat = (ticket.category || '').toLowerCase().trim();
      return cat === spec;
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
  }, [tickets, currentUser]);

  // Department-specific KPI stats
  const deptStats = useMemo(() => {
    let open = 0;
    let done = 0;
    let urgent = 0;

    myDepartmentTickets.forEach((t) => {
      const isResolved = t.status === 'Completed' || t.status === 'Done' || t.status === 'Resolved';
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
      const isResolved = ticket.status === 'Done' || ticket.status === 'Completed' || ticket.status === 'Resolved';
      if (activeSegment === 'active' && isResolved) return false;
      if (activeSegment === 'resolved' && !isResolved) return false;

      // Category filter (if technician chooses to inspect other categories or their own)
      if (selectedCategory !== 'All') {
        const cat = (ticket.category || '').toLowerCase();
        if (cat !== selectedCategory.toLowerCase()) return false;
      }

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
  }, [myDepartmentTickets, activeSegment, selectedCategory, activeFeatureFilter, searchQuery]);

  // Handle Technician completion toggle
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
        message: 'Technician signoff already logged. Awaiting campus user confirmation.'
      });
      return;
    }

    try {
      await handleTicketClosure(ticket.id, 'technician');
      confetti({ particleCount: 40, spread: 60, origin: { y: 0.7 } });
      addToast({
        type: 'success',
        title: 'Work Order Signed Off',
        message: `Work finished on #${ticket.id}. Sent for user closure confirmation.`
      });
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
      {/* 1. Left Sidebar (lg:col-span-2) */}
      <div className="lg:col-span-2">
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

      {/* 2. Center Main Content (lg:col-span-7) */}
      <main className="lg:col-span-7 min-w-0 space-y-6">
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

      {/* 3. Right Sidebar Widgets (lg:col-span-3 space-y-6) */}
      <div className="lg:col-span-3 space-y-6">
        <SlaPriorityRingWidget
          stats={deptStats}
          tickets={myDepartmentTickets}
        />

        <ActivityCalendarWidget />
      </div>
    </div>
  );
}
