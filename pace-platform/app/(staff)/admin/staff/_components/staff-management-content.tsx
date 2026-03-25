'use client';

import { useState, useCallback } from 'react';
import { StaffTable } from './staff-table';
import { InviteForm } from './invite-form';

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  is_leader: boolean;
  is_active: boolean;
  team_id: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  initialStaff: StaffMember[];
}

export function StaffManagementContent({ initialStaff }: Props) {
  const [staffList, setStaffList] = useState<StaffMember[]>(initialStaff);

  const refreshStaff = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/staff');
      const json = await res.json();
      if (json.success && json.data) {
        setStaffList(json.data);
      }
    } catch (err) {
      console.error('スタッフリスト更新エラー:', err);
    }
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <InviteForm onInvited={refreshStaff} />
      </div>
      <StaffTable initialStaff={staffList} />
    </div>
  );
}
