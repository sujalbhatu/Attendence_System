export class GeofenceService {
  /**
   * Calculates geodesic distance between two coordinates in meters using Haversine formula.
   */
  static calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Validates client GPS against target classroom centroid.
   * Accounts for mobile GPS accuracy margin.
   */
  static validateGeofence(clientLat, clientLng, accuracyMeters, targetLat, targetLng, maxRadiusMeters = 35) {
    if (!clientLat || !clientLng) {
      return { valid: false, distance: null, reason: 'GPS coordinates missing' };
    }

    // Ignore ridiculous accuracy reports (> 80m or negative)
    const acc = Math.max(0, Math.min(80, accuracyMeters || 10));
    const rawDistance = this.calculateDistance(clientLat, clientLng, targetLat, targetLng);

    // Effective distance discounts half the GPS uncertainty
    const effectiveDistance = Math.max(0, rawDistance - (acc / 2));
    const valid = effectiveDistance <= maxRadiusMeters;

    return {
      valid,
      rawDistance: Math.round(rawDistance),
      effectiveDistance: Math.round(effectiveDistance),
      maxRadius: maxRadiusMeters,
      accuracyMeters: acc
    };
  }
}
