import React, { useState, useMemo } from 'react';
import { useTickets, isUserTicket } from '../../context/TicketContext';
import { useAuth } from '../../context/AuthContext';
import WorkspaceSidebar from '../common/WorkspaceSidebar';
import DashboardHeroBanner from '../common/DashboardHeroBanner';
import NeetCodeTicketTable from '../tickets/NeetCodeTicketTable';
import NewIssueForm from './NewIssueForm';
import { History, Sparkles, Layers, ArrowLeft } from 'lucide-react';

export default function UserView({ onSelectTicket }) {
  const { tickets, userTab, setUserTab, verifyTicketClosure, addToast } = useTickets();
  const { currentUser } = useAuth();

  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFeatureFilter, setActiveFeatureFilter] = useState('all'); // 'all' | 'ai-triage' | 'urgent' | 'rag-history'

  // Filter to tickets belonging to this active campus user
  const myTickets = useMemo(() => {
    return tickets.filter((t) => isUserTicket(t, currentUser));
  }, [tickets, currentUser]);

  // Compute User-specific statistics
  const userStats = useMemo(() => {
    let resolved = 0;
    let open = 0;
    let urgent = 0;

    myTickets.forEach((t) => {
      const isDone = t.status === 'Completed' || t.status === 'Done' || t.status === 'Resolved';
      if (isDone) resolved++;
      else open++;

      const p = (t.priority || t.urgency || '').toLowerCase();
      if (p === 'urgent' || p === 'emergency' || p === 'critical' || p === 'moderate') {
        urgent++;
      }
    });

    return {
      resolvedCount: resolved,
      openCount: open,
      escalatedCount: urgent,
      total: myTickets.length,
      activeCount: open
    };
  }, [myTickets]);

  // Filtered tickets based on search, category, and feature filter
  const displayedTickets = useMemo(() => {
    return myTickets.filter((t) => {
      // Category filter
      if (selectedCategory !== 'All') {
        const cat = (t.category || '').toLowerCase();
        if (cat !== selectedCategory.toLowerCase()) return false;
      }

      // Feature filter
      if (activeFeatureFilter === 'urgent') {
        const p = (t.priority || t.urgency || '').toLowerCase();
        if (p !== 'urgent' && p !== 'emergency' && p !== 'critical') return false;
      } else if (activeFeatureFilter === 'rag-history') {
        if (!t.ragTicketVolume || Number(t.ragTicketVolume) < 2) return false;
      }

      // Search Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const idMatch = String(t.id || '').toLowerCase().includes(q.replace('#', ''));
        const titleMatch = String(t.title || t.complaint || '').toLowerCase().includes(q);
        const locMatch = String(t.location || '').toLowerCase().includes(q);
        const catMatch = String(t.category || '').toLowerCase().includes(q);
        if (!idMatch && !titleMatch && !locMatch && !catMatch) return false;
      }

      return true;
    });
  }, [myTickets, selectedCategory, activeFeatureFilter, searchQuery]);

  // Handle user completing verification
  const handleToggleComplete = async (ticket) => {
    if (ticket.status === 'Pending User Verification') {
      try {
        await verifyTicketClosure(ticket.id, 'Confirmed repaired by resident');
        addToast({
          type: 'success',
          title: 'Ticket Closed',
          message: `Ticket #${ticket.id} dual-confirmed and completed.`
        });
      } catch (e) {
        addToast({
          type: 'error',
          title: 'Verification Failed',
          message: e.message || 'Could not verify ticket completion.'
        });
      }
    } else if (ticket.status === 'Completed' || ticket.status === 'Done') {
      addToast({
        type: 'info',
        title: 'Already Completed',
        message: 'This ticket has already been resolved and archived.'
      });
    } else {
      addToast({
        type: 'info',
        title: 'Work In Progress',
        message: 'A field technician is assigned. You will be prompted to verify once work is finished.'
      });
    }
  };

  const handleSelectView = (viewKey) => {
    if (viewKey === 'new-issue') {
      setUserTab('new-issue');
    } else if (viewKey === 'all-tickets') {
      setUserTab('my-tickets');
      setActiveFeatureFilter('all');
    } else if (viewKey === 'rag-history') {
      setUserTab('my-tickets');
      setActiveFeatureFilter('rag-history');
    }
  };

  return (
    <div className="w-full max-w-[1440px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* 1. Left Sidebar (lg:col-span-3 xl:col-span-2) */}
      <div className="lg:col-span-3 xl:col-span-2">
        <WorkspaceSidebar
          currentView={userTab === 'new-issue' ? 'new-issue' : (activeFeatureFilter === 'rag-history' ? 'rag-history' : 'all-tickets')}
          onSelectView={handleSelectView}
          selectedCategory={selectedCategory}
          onSelectCategory={(cat) => setSelectedCategory(cat)}
          role="user"
          stats={userStats}
        />
      </div>

      {/* 2. Center Main Content (lg:col-span-9 xl:col-span-10) */}
      <main className="lg:col-span-9 xl:col-span-10 min-w-0 space-y-6">
        {userTab === 'new-issue' ? (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <button
                type="button"
                onClick={() => setUserTab('my-tickets')}
                className="text-xs text-zinc-400 hover:text-white flex items-center gap-1.5 transition"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to All Tickets</span>
              </button>
            </div>
            <NewIssueForm onTicketCreated={() => setUserTab('my-tickets')} />
          </div>
        ) : (
          <div>
            {/* Top Category Feature Cards, Hero Banner, and Search Bar */}
            <DashboardHeroBanner
              title="Campus Dispatch"
              subtitle="Real-time multimodal AI triage and deterministic single-specialty routing."
              stats={userStats}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onRefresh={() => {}}
              onActionClick={() => setUserTab('new-issue')}
              actionButtonLabel="Raise Issue"
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
              role="user"
              emptyMessage={
                activeFeatureFilter === 'rag-history'
                  ? 'No recurring tickets found with prior RAG reports.'
                  : 'No tickets found matching your query.'
              }
            />
          </div>
        )}
      </main>
    </div>
  );
}
