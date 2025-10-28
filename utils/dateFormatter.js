// Date formatting utilities
// Removes dashes from date strings and formats them for display

/**
 * Formats a date string to remove dashes and display in a more readable format
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {string} - Formatted date string (e.g., "2025-09-14" becomes "14 Sep 2025")
 */
function formatDateForDisplay(dateString) {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString; // Return original if invalid
  
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
  
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  
  return `${day} ${month} ${year}`;
}

/**
 * Formats a date string to remove dashes but keep YYYYMMDD format
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {string} - Date string without dashes (e.g., "2025-09-14" becomes "20250914")
 */
function removeDashesFromDate(dateString) {
  if (!dateString) return '';
  return dateString.replace(/-/g, '');
}

/**
 * Formats a date string to display as DD/MM/YYYY
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {string} - Date string in DD/MM/YYYY format
 */
function formatDateWithSlashes(dateString) {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString; // Return original if invalid
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  
  return `${day}/${month}/${year}`;
}

/**
 * Formats a date string to display as DD.MM.YYYY
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {string} - Date string in DD.MM.YYYY format
 */
function formatDateWithDots(dateString) {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString; // Return original if invalid
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  
  return `${day}.${month}.${year}`;
}

/**
 * Formats a location name to have uppercase first letter and remove dashes
 * @param {string} locationString - Location string (e.g., "sunny-beach", "burgas-airport")
 * @returns {string} - Formatted location string (e.g., "Sunny Beach", "Burgas Airport")
 */
function formatLocationName(locationString) {
  if (!locationString) return '';
  
  // Handle special cases first
  const specialCases = {
    'office': 'Office',
    'sunny-beach': 'Sunny Beach',
    'sveti-vlas': 'Sveti Vlas',
    'nesebar': 'Nesebar',
    'burgas': 'Burgas',
    'burgas-airport': 'Burgas Airport',
    'sofia': 'Sofia',
    'sofia-airport': 'Sofia Airport',
    'varna': 'Varna',
    'varna-airport': 'Varna Airport',
    'plovdiv': 'Plovdiv',
    'eleni': 'Eleni',
    'ravda': 'Ravda'
  };
  
  // Return special case if found
  if (specialCases[locationString]) {
    return specialCases[locationString];
  }
  
  // Generic formatting: replace dashes with spaces and capitalize each word
  return locationString
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

module.exports = {
  formatDateForDisplay,
  removeDashesFromDate,
  formatDateWithSlashes,
  formatDateWithDots,
  formatLocationName
};
