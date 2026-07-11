import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Home, Clock, MessageSquare, Folder, Megaphone,
  Search, Bell, ChevronDown, MoreVertical, Plus,
} from 'lucide-react';

/* ─────────── data ─────────── */

const EMPLOYEES = [
  {
    id: 1,
    name: 'Jimmy Henderson',
    email: 'henderson399@gmail.com',
    code: 'CU009',
    designation: 'Angular Developer',
    phone: '788-998-1643',
    joined: 'Mar 27, 2016',
    color: '#4e9af1',
    initials: 'JH',
  },
  {
    id: 2,
    name: 'Eva W Ramirez',
    email: 'eva_ramirez@gmail.com',
    code: 'CU012',
    designation: 'Front-end Developer',
    phone: '603-801-5810',
    joined: 'Jul 02, 2016',
    color: '#f97316',
    initials: 'EW',
  },
  {
    id: 3,
    name: 'Bernita D Stubbs',
    email: 'Subbsbernita@gmail.com',
    code: 'CU081',
    designation: 'Graphic Designer',
    phone: '434-709-1874',
    joined: 'Dec 12, 2017',
    color: '#8b5cf6',
    initials: 'BS',
  },
  {
    id: 4,
    name: 'Terrell Elliott',
    email: 'elliotterrell@gmail.com',
    code: 'CU034',
    designation: 'Mean Developer',
    phone: '318-225-1064',
    joined: 'Apr 12, 2017',
    color: '#14b8a6',
    initials: 'TE',
  },
];

const SIDEBAR_ICONS = [
  { icon: Home, active: true },
  { icon: Clock, active: false },
  { icon: MessageSquare, active: false },
  { icon: Folder, active: false },
  { icon: Megaphone, active: false },
];

const TABS = ['Employee List', 'Management', 'Others'];

/* ─────────── component ─────────── */

export function EmployeeDashboard() {
  const [activeTab, setActiveTab] = useState(0);
  const [selectedRow, setSelectedRow] = useState(1); // Eva is highlighted

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-[#f4f4f4] relative">

      {/* ── green decorative blobs ── */}
      <div
        className="absolute top-0 right-0 w-[180px] h-[180px] bg-[#2ecc71] pointer-events-none z-0"
        style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 0)' }}
      />
      <div
        className="absolute bottom-0 right-0 w-[140px] h-[140px] bg-[#2ecc71] pointer-events-none z-0"
        style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}
      />

      {/* ── left sidebar ── */}
      <aside className="relative z-10 flex w-[56px] flex-col items-center bg-white border-r border-gray-100 py-5 gap-7 shrink-0">
        {/* logo */}
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#2ecc71]/15 text-[#2ecc71]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9,22 9,12 15,12 15,22" />
          </svg>
        </div>

        {/* nav icons */}
        <div className="flex flex-col items-center gap-6 mt-2">
          {SIDEBAR_ICONS.map(({ icon: Icon, active }, i) => (
            <div key={i} className="relative flex items-center">
              {active && (
                <div className="absolute -left-[18px] w-[3px] h-6 bg-[#2ecc71] rounded-r-full" />
              )}
              <button
                className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                  active ? 'text-[#2ecc71]' : 'text-gray-300 hover:text-gray-400'
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* ── main area ── */}
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">

        {/* ── inner top bar ── */}
        <div className="flex h-[56px] items-center justify-between bg-white/80 backdrop-blur-sm border-b border-gray-100 px-6 shrink-0">
          {/* search */}
          <button className="flex items-center gap-2 text-gray-300 hover:text-gray-400 transition-colors">
            <Search className="h-[18px] w-[18px]" />
          </button>

          {/* right: bell + user */}
          <div className="flex items-center gap-5">
            <div className="relative">
              <Bell className="h-[18px] w-[18px] text-gray-400" />
              <span className="absolute -top-0.5 -right-0.5 h-[6px] w-[6px] rounded-full bg-[#2ecc71]" />
            </div>
            <div className="flex items-center gap-2.5 cursor-pointer">
              <div className="h-8 w-8 rounded-full overflow-hidden bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-[11px] font-bold">
                AV
              </div>
              <span className="text-[13px] font-medium text-gray-700">Alief Vinicius</span>
              <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
            </div>
          </div>
        </div>

        {/* ── content ── */}
        <div className="flex-1 overflow-auto px-8 py-7">

          {/* heading row */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-[26px] font-bold text-gray-800 tracking-tight">Dashbaord</h1>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-1.5 bg-[#2ecc71] hover:bg-[#27af61] text-white text-[13px] font-semibold px-4 py-2 rounded-[5px] transition-colors shadow-sm shadow-[#2ecc71]/30"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Employee
            </motion.button>
          </div>

          {/* tabs */}
          <div className="flex gap-0 border-b border-gray-200 mb-4">
            {TABS.map((tab, i) => (
              <button
                key={tab}
                onClick={() => setActiveTab(i)}
                className={`relative px-5 pb-3 pt-1 text-[13px] font-medium transition-colors ${
                  activeTab === i ? 'text-gray-800' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {tab}
                {activeTab === i && (
                  <motion.span
                    layoutId="emp-tab-line"
                    className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#2ecc71] rounded-full"
                    transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* table */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            {/* table header */}
            <div className="grid grid-cols-[40px_1fr_140px_160px_150px_140px_40px] px-6 py-3 border-b border-gray-100">
              <div />
              <span className="text-[11.5px] font-medium text-gray-400">Basic Info</span>
              <span className="text-[11.5px] font-medium text-gray-400">Employee Code</span>
              <span className="text-[11.5px] font-medium text-gray-400">Designation</span>
              <span className="text-[11.5px] font-medium text-gray-400">Phone Number</span>
              <span className="text-[11.5px] font-medium text-gray-400">Joining Date</span>
              <div />
            </div>

            {/* rows */}
            {EMPLOYEES.map((emp, idx) => (
              <motion.div
                key={emp.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.06, duration: 0.22 }}
                onClick={() => setSelectedRow(emp.id)}
                className={`grid grid-cols-[40px_1fr_140px_160px_150px_140px_40px] px-6 py-[14px] border-b border-gray-50 last:border-0 cursor-pointer transition-colors ${
                  selectedRow === emp.id ? 'bg-gray-50/80' : 'hover:bg-gray-50/40'
                }`}
              >
                {/* # */}
                <span className="text-[12px] text-gray-400 self-center">{emp.id}</span>

                {/* basic info */}
                <div className="flex items-center gap-3">
                  <div
                    className="h-9 w-9 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                    style={{ backgroundColor: emp.color }}
                  >
                    {emp.initials}
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-gray-800 leading-tight">{emp.name}</p>
                    <p className="text-[11.5px] text-gray-400">{emp.email}</p>
                  </div>
                </div>

                {/* code */}
                <span className="text-[13px] text-gray-600 self-center">{emp.code}</span>

                {/* designation */}
                <span className="text-[13px] font-medium text-gray-700 self-center">{emp.designation}</span>

                {/* phone */}
                <span className="text-[13px] text-gray-600 self-center">{emp.phone}</span>

                {/* joined */}
                <span className="text-[13px] text-gray-600 self-center">{emp.joined}</span>

                {/* actions */}
                <button className="self-center text-gray-300 hover:text-gray-500 transition-colors">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default EmployeeDashboard;
